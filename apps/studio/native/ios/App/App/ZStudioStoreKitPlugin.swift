// Z STUDIO — APPLE STOREKIT NATIVE AUTHORITY V2
// Device-side StoreKit 2 bridge only. The server owns identity, trial eligibility,
// commercial state and transaction delivery. Raw signed data is transient.

import Foundation
import Capacitor
import StoreKit

@objc(ZStudioStoreKitPlugin)
public final class ZStudioStoreKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ZStudioStoreKitPlugin"
    public let jsName = "ZStudioStoreKit"

    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "appTransaction", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loadProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "currentEntitlements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unfinishedTransactions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncPurchases", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finishTransaction", returnType: CAPPluginReturnPromise)
    ]

    private var updatesTask: Task<Void, Never>?

    override public func load() { startTransactionUpdatesListener() }
    deinit { updatesTask?.cancel() }

    private func subscriptionPeriodUnit(_ unit: Product.SubscriptionPeriod.Unit) -> String {
        switch unit {
        case .day: return "day"
        case .week: return "week"
        case .month: return "month"
        case .year: return "year"
        @unknown default: return "unknown"
        }
    }

    private func productPayload(_ product: Product) -> [String: Any] {
        var payload: [String: Any] = [
            "productId": product.id,
            "displayName": product.displayName,
            "displayDescription": product.description,
            "displayPrice": product.displayPrice,
            "price": NSDecimalNumber(decimal: product.price).stringValue
        ]
        if let subscription = product.subscription {
            payload["subscriptionGroupId"] = subscription.subscriptionGroupID
            payload["subscriptionPeriod"] = [
                "unit": subscriptionPeriodUnit(subscription.subscriptionPeriod.unit),
                "value": subscription.subscriptionPeriod.value
            ]
        }
        return payload
    }

    private func iso8601(_ date: Date) -> String { ISO8601DateFormatter().string(from: date) }

    private func verifiedEnvelope(_ result: VerificationResult<Transaction>) -> [String: Any]? {
        guard case .verified(let transaction) = result else { return nil }
        guard transaction.ownershipType == .purchased else { return nil }
        guard let appAccountToken = transaction.appAccountToken else { return nil }

        var payload: [String: Any] = [
            "verification": "verified",
            "transactionId": String(transaction.id),
            "originalTransactionId": String(transaction.originalID),
            "productId": transaction.productID,
            "appAccountToken": appAccountToken.uuidString.lowercased(),
            "purchaseDate": iso8601(transaction.purchaseDate),
            "jwsRepresentation": result.jwsRepresentation
        ]
        if let expirationDate = transaction.expirationDate { payload["expirationDate"] = iso8601(expirationDate) }
        if let revocationDate = transaction.revocationDate { payload["revocationDate"] = iso8601(revocationDate) }
        if #available(iOS 16.0, *) { payload["environment"] = transaction.environment.rawValue }
        return payload
    }

    private func startTransactionUpdatesListener() {
        updatesTask?.cancel()
        updatesTask = Task { [weak self] in
            for await result in Transaction.updates {
                if Task.isCancelled { return }
                guard let self = self, let payload = self.verifiedEnvelope(result) else { continue }
                // Never finish here. Server-side delivery must succeed first.
                self.notifyListeners("transactionUpdated", data: payload)
            }
        }
    }

    @objc func appTransaction(_ call: CAPPluginCall) {
        Task {
            do {
                let result = try await AppTransaction.shared
                guard case .verified(let appTransaction) = result else {
                    call.reject("App transaction verification failed.", "APPLE_APP_TRANSACTION_UNVERIFIED")
                    return
                }
                call.resolve([
                    "verification": "verified",
                    "appTransactionId": appTransaction.appTransactionID
                ])
            } catch {
                call.reject("Unable to load the App Store app transaction.", "APPLE_APP_TRANSACTION_UNAVAILABLE", error)
            }
        }
    }

    @objc func loadProducts(_ call: CAPPluginCall) {
        let requested = call.getArray("productIds", String.self) ?? []
        let productIds = Array(Set(requested.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty })).sorted()
        guard !productIds.isEmpty else {
            call.reject("At least one productId is required.", "APPLE_PRODUCT_IDS_REQUIRED")
            return
        }
        Task {
            do {
                let products = try await Product.products(for: productIds).sorted { $0.id < $1.id }
                call.resolve(["products": products.map { self.productPayload($0) }])
            } catch {
                call.reject("Unable to load App Store products.", "APPLE_PRODUCTS_UNAVAILABLE", error)
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let rawProductId = call.getString("productId"), !rawProductId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            call.reject("productId is required.", "APPLE_PRODUCT_ID_REQUIRED")
            return
        }
        let productId = rawProductId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let rawToken = call.getString("appAccountToken"), let appAccountToken = UUID(uuidString: rawToken) else {
            call.reject("appAccountToken must be a UUID.", "APPLE_APP_ACCOUNT_TOKEN_INVALID")
            return
        }
        guard let rawEligibility = call.getString("introductoryOfferEligibilityJws") else {
            call.reject("Server-signed introductory-offer eligibility is required.", "APPLE_INTRO_ELIGIBILITY_REQUIRED")
            return
        }
        let eligibilityJws = rawEligibility.trimmingCharacters(in: .whitespacesAndNewlines)
        guard eligibilityJws.count <= 16384, eligibilityJws.split(separator: ".").count == 3 else {
            call.reject("Introductory-offer eligibility JWS is invalid.", "APPLE_INTRO_ELIGIBILITY_INVALID")
            return
        }

        Task {
            do {
                let products = try await Product.products(for: [productId])
                guard let product = products.first(where: { $0.id == productId }) else {
                    call.reject("Requested App Store product was not found.", "APPLE_PRODUCT_NOT_FOUND")
                    return
                }
                let purchaseResult = try await product.purchase(options: [
                    .appAccountToken(appAccountToken),
                    .introductoryOfferEligibility(compactJWS: eligibilityJws)
                ])
                switch purchaseResult {
                case .success(let verificationResult):
                    guard let transaction = self.verifiedEnvelope(verificationResult) else {
                        call.reject("StoreKit transaction verification failed.", "APPLE_TRANSACTION_UNVERIFIED")
                        return
                    }
                    call.resolve(["status": "verified", "transaction": transaction])
                case .pending:
                    call.resolve(["status": "pending"])
                case .userCancelled:
                    call.resolve(["status": "cancelled"])
                @unknown default:
                    call.reject("Unknown App Store purchase result.", "APPLE_PURCHASE_RESULT_UNKNOWN")
                }
            } catch {
                call.reject("App Store purchase failed.", "APPLE_PURCHASE_FAILED", error)
            }
        }
    }

    @objc func currentEntitlements(_ call: CAPPluginCall) {
        Task {
            var transactions: [[String: Any]] = []
            for await result in Transaction.currentEntitlements {
                if let payload = self.verifiedEnvelope(result) { transactions.append(payload) }
            }
            call.resolve(["transactions": transactions])
        }
    }

    @objc func unfinishedTransactions(_ call: CAPPluginCall) {
        Task {
            var transactions: [[String: Any]] = []
            for await result in Transaction.unfinished {
                if let payload = self.verifiedEnvelope(result) { transactions.append(payload) }
            }
            call.resolve(["transactions": transactions])
        }
    }

    @objc func syncPurchases(_ call: CAPPluginCall) {
        Task {
            do { try await AppStore.sync(); call.resolve(["synced": true]) }
            catch { call.reject("App Store synchronization failed.", "APPLE_SYNC_FAILED", error) }
        }
    }

    @objc func finishTransaction(_ call: CAPPluginCall) {
        guard let rawTransactionId = call.getString("transactionId") else {
            call.reject("transactionId is required as a decimal string.", "APPLE_TRANSACTION_ID_REQUIRED")
            return
        }
        let transactionIdText = rawTransactionId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let transactionId = UInt64(transactionIdText), String(transactionId) == transactionIdText else {
            call.reject("transactionId must be an exact UInt64 decimal string.", "APPLE_TRANSACTION_ID_INVALID")
            return
        }
        Task {
            for await result in Transaction.unfinished {
                guard case .verified(let transaction) = result,
                      transaction.ownershipType == .purchased,
                      transaction.appAccountToken != nil,
                      transaction.id == transactionId else { continue }
                await transaction.finish()
                call.resolve(["finished": true, "transactionId": String(transaction.id)])
                return
            }
            call.reject("Verified unfinished transaction was not found.", "APPLE_TRANSACTION_NOT_UNFINISHED")
        }
    }
}

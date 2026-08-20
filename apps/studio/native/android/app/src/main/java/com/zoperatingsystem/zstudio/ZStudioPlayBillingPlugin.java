package com.zoperatingsystem.zstudio;

import android.os.Handler;
import android.os.Looper;

import com.android.billingclient.api.AccountIdentifiers;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryProductDetailsResult;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

// Z STUDIO — GOOGLE PLAY BILLING NATIVE AUTHORITY V1
// Device-side Play Billing bridge only.
// This plugin never grants Studio/AI entitlement, never contains Play API
// credentials, never writes Supabase commercial state, and never acknowledges
// a purchase. The server must verify the purchase token, apply commercial state,
// and acknowledge delivery through Google Play Developer API.
@CapacitorPlugin(name = "ZStudioPlayBilling")
public final class ZStudioPlayBillingPlugin extends Plugin implements PurchasesUpdatedListener {
    private static final String PRODUCT_ID = "zstudio.access";
    private static final String TRIAL_OFFER_ID = "trial-3d";
    private static final Set<String> BASE_PLAN_IDS = Set.of("weekly", "monthly", "annual");
    private static final Pattern UUID_PATTERN = Pattern.compile(
        "^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
        Pattern.CASE_INSENSITIVE
    );

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private BillingClient billingClient;
    private boolean startingConnection = false;
    private final List<Runnable> readyQueue = new ArrayList<>();
    private final List<PluginCall> readyCalls = new ArrayList<>();

    @Override
    public void load() {
        billingClient = BillingClient.newBuilder(getContext())
            .setListener(this)
            .enablePendingPurchases(
                PendingPurchasesParams.newBuilder()
                    .enableOneTimeProducts()
                    .build()
            )
            .enableAutoServiceReconnection()
            .build();
        super.load();
    }

    private void withBillingReady(PluginCall call, Runnable action) {
        if (billingClient != null && billingClient.isReady()) {
            action.run();
            return;
        }

        synchronized (this) {
            readyQueue.add(action);
            readyCalls.add(call);
            if (startingConnection) return;
            startingConnection = true;
        }

        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult result) {
                List<Runnable> actions;
                List<PluginCall> calls;
                synchronized (ZStudioPlayBillingPlugin.this) {
                    startingConnection = false;
                    actions = new ArrayList<>(readyQueue);
                    calls = new ArrayList<>(readyCalls);
                    readyQueue.clear();
                    readyCalls.clear();
                }

                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    for (PluginCall queuedCall : calls) {
                        queuedCall.reject(
                            "Google Play Billing is unavailable.",
                            "GOOGLE_PLAY_BILLING_UNAVAILABLE"
                        );
                    }
                    return;
                }

                for (Runnable queuedAction : actions) queuedAction.run();
            }

            @Override
            public void onBillingServiceDisconnected() {
                // enableAutoServiceReconnection() owns reconnection. We intentionally
                // keep no entitlement state on device while the service is unavailable.
            }
        });
    }

    private QueryProductDetailsParams productQuery() {
        QueryProductDetailsParams.Product product =
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(PRODUCT_ID)
                .setProductType(BillingClient.ProductType.SUBS)
                .build();
        return QueryProductDetailsParams.newBuilder()
            .setProductList(Collections.singletonList(product))
            .build();
    }

    private JSObject pricingPhasePayload(ProductDetails.PricingPhase phase) {
        return new JSObject()
            .put("formattedPrice", phase.getFormattedPrice())
            .put("priceAmountMicros", phase.getPriceAmountMicros())
            .put("priceCurrencyCode", phase.getPriceCurrencyCode())
            .put("billingPeriod", phase.getBillingPeriod())
            .put("billingCycleCount", phase.getBillingCycleCount())
            .put("recurrenceMode", phase.getRecurrenceMode());
    }

    private JSObject offerPayload(ProductDetails.SubscriptionOfferDetails offer) {
        JSONArray phases = new JSONArray();
        for (ProductDetails.PricingPhase phase : offer.getPricingPhases().getPricingPhaseList()) {
            phases.put(pricingPhasePayload(phase));
        }
        return new JSObject()
            .put("basePlanId", offer.getBasePlanId())
            .put("offerId", offer.getOfferId())
            .put("offerToken", offer.getOfferToken())
            .put("pricingPhases", phases);
    }

    private JSObject productPayload(ProductDetails details) {
        JSONArray offers = new JSONArray();
        List<ProductDetails.SubscriptionOfferDetails> subscriptionOffers =
            details.getSubscriptionOfferDetails();
        if (subscriptionOffers != null) {
            for (ProductDetails.SubscriptionOfferDetails offer : subscriptionOffers) {
                if (!BASE_PLAN_IDS.contains(offer.getBasePlanId())) continue;
                if (offer.getOfferId() != null && !TRIAL_OFFER_ID.equals(offer.getOfferId())) {
                    continue;
                }
                offers.put(offerPayload(offer));
            }
        }
        return new JSObject()
            .put("productId", details.getProductId())
            .put("name", details.getName())
            .put("title", details.getTitle())
            .put("description", details.getDescription())
            .put("offers", offers);
    }

    private String purchaseState(int state) {
        if (state == Purchase.PurchaseState.PURCHASED) return "purchased";
        if (state == Purchase.PurchaseState.PENDING) return "pending";
        return "unspecified";
    }

    private JSObject purchasePayload(Purchase purchase) {
        JSONArray products = new JSONArray();
        for (String product : purchase.getProducts()) products.put(product);

        String obfuscatedAccountId = null;
        AccountIdentifiers identifiers = purchase.getAccountIdentifiers();
        if (identifiers != null) {
            obfuscatedAccountId = identifiers.getObfuscatedAccountId();
        }

        return new JSObject()
            .put("evidence", "google_play_device_purchase")
            .put("purchaseToken", purchase.getPurchaseToken())
            .put("products", products)
            .put("purchaseState", purchaseState(purchase.getPurchaseState()))
            .put("purchaseTimeMs", purchase.getPurchaseTime())
            .put("acknowledged", purchase.isAcknowledged())
            .put("autoRenewing", purchase.isAutoRenewing())
            .put("suspended", purchase.isSuspended())
            .put("obfuscatedAccountId", obfuscatedAccountId)
            .put("rawProviderPayloadIncluded", false);
    }

    @PluginMethod
    public void loadProducts(PluginCall call) {
        withBillingReady(call, () -> billingClient.queryProductDetailsAsync(
            productQuery(),
            (BillingResult result, QueryProductDetailsResult detailsResult) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    call.reject(
                        "Unable to load Google Play subscription offers.",
                        "GOOGLE_PLAY_PRODUCTS_UNAVAILABLE"
                    );
                    return;
                }

                JSONArray products = new JSONArray();
                for (ProductDetails details : detailsResult.getProductDetailsList()) {
                    if (PRODUCT_ID.equals(details.getProductId())) {
                        products.put(productPayload(details));
                    }
                }
                call.resolve(new JSObject().put("products", products));
            }
        ));
    }

    private ProductDetails.SubscriptionOfferDetails selectOffer(
        ProductDetails details,
        String basePlanId,
        boolean useTrialOffer
    ) {
        List<ProductDetails.SubscriptionOfferDetails> offers = details.getSubscriptionOfferDetails();
        if (offers == null) return null;
        for (ProductDetails.SubscriptionOfferDetails offer : offers) {
            if (!basePlanId.equals(offer.getBasePlanId())) continue;
            String offerId = offer.getOfferId();
            if (useTrialOffer && TRIAL_OFFER_ID.equals(offerId)) return offer;
            if (!useTrialOffer && offerId == null) return offer;
        }
        return null;
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        String rawPlan = call.getString("basePlanId");
        String basePlanId = rawPlan == null ? "" : rawPlan.trim().toLowerCase(Locale.ROOT);
        if (!BASE_PLAN_IDS.contains(basePlanId)) {
            call.reject("basePlanId is not authorized.", "GOOGLE_PLAY_BASE_PLAN_INVALID");
            return;
        }

        Boolean useTrialOffer = call.getBoolean("useTrialOffer", false);
        String rawAccountId = call.getString("obfuscatedAccountId");
        String accountId = rawAccountId == null ? "" : rawAccountId.trim().toLowerCase(Locale.ROOT);
        if (!UUID_PATTERN.matcher(accountId).matches()) {
            call.reject(
                "obfuscatedAccountId must be the canonical ZOS person UUID.",
                "GOOGLE_PLAY_ACCOUNT_ID_INVALID"
            );
            return;
        }

        withBillingReady(call, () -> billingClient.queryProductDetailsAsync(
            productQuery(),
            (BillingResult result, QueryProductDetailsResult detailsResult) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    call.reject("Unable to refresh Google Play offers.", "GOOGLE_PLAY_PRODUCTS_UNAVAILABLE");
                    return;
                }

                ProductDetails product = null;
                for (ProductDetails candidate : detailsResult.getProductDetailsList()) {
                    if (PRODUCT_ID.equals(candidate.getProductId())) {
                        product = candidate;
                        break;
                    }
                }
                if (product == null) {
                    call.reject("Z Studio subscription is unavailable.", "GOOGLE_PLAY_PRODUCT_UNAVAILABLE");
                    return;
                }

                ProductDetails.SubscriptionOfferDetails offer =
                    selectOffer(product, basePlanId, Boolean.TRUE.equals(useTrialOffer));
                if (offer == null) {
                    call.reject(
                        "Requested Google Play offer is unavailable for this account.",
                        Boolean.TRUE.equals(useTrialOffer)
                            ? "GOOGLE_PLAY_TRIAL_OFFER_UNAVAILABLE"
                            : "GOOGLE_PLAY_BASE_PLAN_UNAVAILABLE"
                    );
                    return;
                }

                BillingFlowParams.ProductDetailsParams detailsParams =
                    BillingFlowParams.ProductDetailsParams.newBuilder()
                        .setProductDetails(product)
                        .setOfferToken(offer.getOfferToken())
                        .build();
                BillingFlowParams flowParams = BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(Collections.singletonList(detailsParams))
                    .setObfuscatedAccountId(accountId)
                    .setIsOfferPersonalized(false)
                    .build();

                mainHandler.post(() -> {
                    BillingResult launchResult = billingClient.launchBillingFlow(
                        getActivity(),
                        flowParams
                    );
                    if (launchResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        call.reject(
                            "Unable to launch Google Play billing flow.",
                            "GOOGLE_PLAY_BILLING_FLOW_FAILED"
                        );
                        return;
                    }
                    call.resolve(new JSObject().put("launched", true));
                });
            }
        ));
    }

    @PluginMethod
    public void currentPurchases(PluginCall call) {
        withBillingReady(call, () -> billingClient.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder()
                .setProductType(BillingClient.ProductType.SUBS)
                .includeSuspendedSubscriptions(true)
                .build(),
            (BillingResult result, List<Purchase> purchases) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    call.reject(
                        "Unable to query Google Play purchases.",
                        "GOOGLE_PLAY_PURCHASES_UNAVAILABLE"
                    );
                    return;
                }
                JSONArray payloads = new JSONArray();
                for (Purchase purchase : purchases) payloads.put(purchasePayload(purchase));
                call.resolve(new JSObject().put("purchases", payloads));
            }
        ));
    }

    @Override
    public void onPurchasesUpdated(BillingResult result, List<Purchase> purchases) {
        JSObject update = new JSObject()
            .put("responseCode", result.getResponseCode())
            .put("debugMessage", result.getDebugMessage());
        JSONArray payloads = new JSONArray();
        if (purchases != null) {
            for (Purchase purchase : purchases) payloads.put(purchasePayload(purchase));
        }
        update.put("purchases", payloads);
        notifyListeners("purchaseUpdated", update, true);
    }

    @Override
    protected void handleOnDestroy() {
        synchronized (this) {
            for (PluginCall call : readyCalls) {
                call.reject("Google Play Billing bridge was destroyed.", "GOOGLE_PLAY_BILLING_DESTROYED");
            }
            readyCalls.clear();
            readyQueue.clear();
            startingConnection = false;
        }
        if (billingClient != null) {
            billingClient.endConnection();
            billingClient = null;
        }
        super.handleOnDestroy();
    }
}

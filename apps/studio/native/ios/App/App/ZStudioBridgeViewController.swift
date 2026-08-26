// Z Studio — native Capacitor bridge for the StoreKit authority.
// No commercial state or purchase logic belongs in this controller.

import Capacitor

class ZStudioBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(
            ZStudioStoreKitPlugin()
        )
    }
}

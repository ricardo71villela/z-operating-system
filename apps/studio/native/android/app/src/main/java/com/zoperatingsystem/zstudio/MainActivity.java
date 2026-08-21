package com.zoperatingsystem.zstudio;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private static final String GOOGLE_PLAY_BRIDGE_ASSET = "google-play-billing-bridge.js";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(ZStudioPlayBillingPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        injectGooglePlayBridge();
    }

    private void injectGooglePlayBridge() {
        if (getBridge() == null) return;

        String baseUrl = getBridge()
            .getConfig()
            .getPluginConfiguration("ZStudioPlayBilling")
            .getString("commercialBaseUrl", "")
            .trim();

        String js = "(function(){"
            + "window.ZSTUDIO_COMMERCIAL_BASE_URL=" + JSONObject.quote(baseUrl) + ";"
            + "var run=function(){"
            + "if(window.ZStudioGooglePlay&&window.ZStudioGooglePlay.onNativeResume){"
            + "window.ZStudioGooglePlay.onNativeResume();return;}"
            + "if(document.querySelector('script[data-zstudio-google-play-bridge]'))return;"
            + "var s=document.createElement('script');"
            + "s.src='" + GOOGLE_PLAY_BRIDGE_ASSET + "';"
            + "s.dataset.zstudioGooglePlayBridge='v1';"
            + "s.onload=function(){if(window.ZStudioGooglePlay&&window.ZStudioGooglePlay.onNativeResume){window.ZStudioGooglePlay.onNativeResume();}};"
            + "(document.head||document.documentElement).appendChild(s);"
            + "};"
            + "if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',run,{once:true});}else{run();}"
            + "})();";

        getBridge().eval(js, null);
    }
}

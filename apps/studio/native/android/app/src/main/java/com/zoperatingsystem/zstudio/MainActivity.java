package com.zoperatingsystem.zstudio;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(ZStudioPlayBillingPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

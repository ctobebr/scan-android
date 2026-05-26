package com.pointCloud.app;

import android.os.Build;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.JavascriptInterface;

import android.util.Log;

import com.getcapacitor.BridgeActivity;
import com.ptcr.mobile.PtcrPlugin;
import com.ptcr.mobile.ZipPlugin;
import com.ptcr.mobile.AppContextHolder;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        initialPlugins.add(PtcrPlugin.class);
        initialPlugins.add(ZipPlugin.class);
        super.onCreate(savedInstanceState);

        Log.d("MainActivity", "PtcrPlugin registered via initialPlugins: " + PtcrPlugin.class.getName());
        AppContextHolder.INSTANCE.init(getApplication());

        try {
            getBridge().getWebView().addJavascriptInterface(new Object() {
                @JavascriptInterface
                public void setImmersive(final boolean immersive) {
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            try {
                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                                    WindowInsetsController controller = getWindow().getInsetsController();
                                    if (controller != null) {
                                        if (immersive) {
                                            controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                                            controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                                        } else {
                                            controller.show(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                                        }
                                    }
                                } else {
                                    View decorView = getWindow().getDecorView();
                                    if (immersive) {
                                        decorView.setSystemUiVisibility(
                                                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                                                | View.SYSTEM_UI_FLAG_FULLSCREEN
                                                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                                                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                                                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                                                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                                        );
                                    } else {
                                        decorView.setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
                                    }
                                }
                            } catch (Exception e) {
                                e.printStackTrace();
                            }
                        }
                    });
                }
            }, "AndroidImmersive");
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}

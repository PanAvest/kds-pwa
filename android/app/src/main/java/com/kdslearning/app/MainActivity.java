package com.kdslearning.app;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebView;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {

    private View splashOverlay;
    private boolean splashHidden = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        showNativeSplash();
        attachWebViewReadyListener();
    }

    private void showNativeSplash() {
        LayoutInflater inflater = LayoutInflater.from(this);
        splashOverlay = inflater.inflate(R.layout.native_splash_overlay, null, false);
        addContentView(
            splashOverlay,
            new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );
        splashOverlay.bringToFront();
    }

    private void attachWebViewReadyListener() {
        if (this.bridge == null) {
            return;
        }

        final BridgeWebView webView = (BridgeWebView) this.bridge.getWebView();
        if (webView == null) {
            return;
        }

        webView.setWebViewClient(new BridgeWebViewClient(this.bridge) {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (url != null && !"about:blank".equals(url)) {
                    runOnUiThread(() -> hideNativeSplash());
                }
            }
        });
    }

    private void hideNativeSplash() {
        if (splashOverlay == null || splashHidden) {
            return;
        }
        splashHidden = true;
        splashOverlay.animate()
            .alpha(0f)
            .setDuration(300)
            .withEndAction(() -> splashOverlay.setVisibility(View.GONE))
            .start();
    }
}

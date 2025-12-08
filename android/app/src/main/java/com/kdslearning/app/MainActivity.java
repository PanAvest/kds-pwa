package com.kdslearning.app;

import android.os.Bundle;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.graphics.Color;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {

    private View splashOverlay;
    private boolean splashHidden = false;
    private LinearLayout bottomBar;
    private final String[] tabTitles = new String[] { "Home", "Programs", "E-Books", "Dashboard" };
    private final String[] tabPaths  = new String[] { "/", "/courses", "/ebooks", "/dashboard" };
    private final int[] tabIcons = new int[] {
        R.drawable.tab_home,
        R.drawable.tab_programs,
        R.drawable.tab_ebooks,
        R.drawable.tab_dashboard
    };
    private int currentTab = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        showNativeSplash();
        attachWebViewReadyListener();
        setupBottomBar();
    }

    private void showNativeSplash() {
        LayoutInflater inflater = LayoutInflater.from(this);
        splashOverlay = inflater.inflate(R.layout.native_splash_overlay, findViewById(android.R.id.content), false);
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

        final WebView webView = this.bridge.getWebView();
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

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request == null || !request.isForMainFrame()) return;
                view.evaluateJavascript("window.dispatchEvent(new Event('capacitorOffline'));", null);
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
                super.onReceivedHttpError(view, request, errorResponse);
                if (request == null || !request.isForMainFrame()) return;
                // Signal offline/failed load to the web layer
                view.evaluateJavascript("window.dispatchEvent(new Event('capacitorOffline'));", null);
            }
        });
    }

    private void setupBottomBar() {
        if (bottomBar != null) return;

        bottomBar = new LinearLayout(this);
        bottomBar.setOrientation(LinearLayout.HORIZONTAL);
        bottomBar.setBackgroundColor(Color.parseColor("#FFFFFFFF"));
        bottomBar.setPadding(dp(12), dp(6), dp(12), dp(10));
        bottomBar.setGravity(Gravity.CENTER);
        bottomBar.setElevation(dp(4));

        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dp(72)
        );
        lp.gravity = Gravity.BOTTOM;

        addContentView(bottomBar, lp);
        bottomBar.bringToFront();

        for (int i = 0; i < tabTitles.length; i++) {
            final int index = i;
            LinearLayout tabContainer = new LinearLayout(this);
            tabContainer.setOrientation(LinearLayout.VERTICAL);
            tabContainer.setGravity(Gravity.CENTER);
            LinearLayout.LayoutParams childLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f);
            tabContainer.setLayoutParams(childLp);
            tabContainer.setPadding(0, dp(6), 0, dp(6));

            ImageView icon = new ImageView(this);
            LinearLayout.LayoutParams iconLp = new LinearLayout.LayoutParams(dp(26), dp(26));
            iconLp.bottomMargin = dp(4);
            icon.setLayoutParams(iconLp);
            icon.setImageResource(tabIcons[i]);

            TextView label = new TextView(this);
            label.setText(tabTitles[i]);
            label.setTextSize(12f);
            label.setGravity(Gravity.CENTER);

            tabContainer.addView(icon);
            tabContainer.addView(label);

            tabContainer.setOnClickListener(v -> {
                currentTab = index;
                updateTabSelection();
                navigateTo(tabPaths[index]);
            });
            bottomBar.addView(tabContainer);
        }

        updateTabSelection();
        applyBottomPadding();
    }

    private void updateTabSelection() {
        if (bottomBar == null) return;
        int activeColor = Color.parseColor("#b65437");
        int mutedColor = Color.parseColor("#555555");
        for (int i = 0; i < bottomBar.getChildCount(); i++) {
            View child = bottomBar.getChildAt(i);
            if (child instanceof LinearLayout tab) {
                if (tab.getChildCount() >= 2) {
                    View iconView = tab.getChildAt(0);
                    View labelView = tab.getChildAt(1);
                    int color = (i == currentTab) ? activeColor : mutedColor;
                    if (iconView instanceof ImageView) {
                        ((ImageView) iconView).setColorFilter(color);
                    }
                    if (labelView instanceof TextView) {
                        ((TextView) labelView).setTextColor(color);
                    }
                }
            }
        }
    }

    private void navigateTo(String path) {
        if (this.bridge == null) return;
        WebView webView = this.bridge.getWebView();
        if (webView == null) return;
        String safePath = path.startsWith("/") ? path : "/" + path;
        webView.evaluateJavascript("window.location.href = '" + safePath + "';", null);
    }

    private void applyBottomPadding() {
        if (this.bridge == null) return;
        WebView webView = this.bridge.getWebView();
        if (webView == null) return;
        int extra = dp(72);
        webView.setPadding(webView.getPaddingLeft(), webView.getPaddingTop(), webView.getPaddingRight(), extra);
        webView.setClipToPadding(false);
    }

    private int dp(int value) {
        float density = getResources().getDisplayMetrics().density;
        return Math.round(value * density);
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

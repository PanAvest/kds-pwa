package com.kdslearning.app;

import android.os.Bundle;
import android.os.Handler;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.ProgressBar;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.graphics.Color;
import android.content.res.ColorStateList;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {

    private View splashOverlay;
    private View loadingOverlay;
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
        // Initially hide the bottom bar while splash is visible
        if (bottomBar != null) {
            bottomBar.setVisibility(View.GONE);
        }
    }

    private void showNativeSplash() {
        if (splashOverlay != null) {
            splashOverlay.setVisibility(View.VISIBLE);
            splashOverlay.setAlpha(1.0f);
            splashOverlay.bringToFront();
            splashHidden = false;
            if (bottomBar != null) {
                bottomBar.setVisibility(View.GONE);
            }
            return;
        }

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
        splashHidden = false;
    }

    private void showLoadingOverlay() {
        if (loadingOverlay == null) {
            FrameLayout container = new FrameLayout(this);
            // Semi-transparent background so we can see the pages behind
            container.setBackgroundColor(Color.parseColor("#80FFFFFF"));
            
            ProgressBar progressBar = new ProgressBar(this);
            progressBar.setIndeterminate(true);
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
                progressBar.setIndeterminateTintList(ColorStateList.valueOf(Color.parseColor("#B65437")));
            }

            FrameLayout.LayoutParams pbParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            );
            pbParams.gravity = Gravity.CENTER;
            container.addView(progressBar, pbParams);

            loadingOverlay = container;
            
            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            );
            lp.bottomMargin = dp(102); // Align with top of bottom bar
            
            addContentView(loadingOverlay, lp);
        }
        
        loadingOverlay.setAlpha(1.0f);
        loadingOverlay.setVisibility(View.VISIBLE);
        loadingOverlay.bringToFront();
        
        if (bottomBar != null) {
            bottomBar.bringToFront();
        }
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
                    // Reduced delay for faster experience
                    new Handler(getMainLooper()).postDelayed(() -> hideNativeSplash(), 500);
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
        bottomBar.setPadding(dp(12), dp(6), dp(12), dp(20)); // Keep bottom padding
        bottomBar.setGravity(Gravity.TOP | Gravity.CENTER_HORIZONTAL);
        bottomBar.setElevation(dp(4));

        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dp(102) // Height remains at 102dp
        );
        lp.gravity = Gravity.BOTTOM;

        addContentView(bottomBar, lp);
        bottomBar.bringToFront();

        for (int i = 0; i < tabTitles.length; i++) {
            final int index = i;
            LinearLayout tabContainer = new LinearLayout(this);
            tabContainer.setOrientation(LinearLayout.VERTICAL);
            tabContainer.setGravity(Gravity.CENTER);
            LinearLayout.LayoutParams childLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
            tabContainer.setLayoutParams(childLp);
            tabContainer.setPadding(0, dp(12), 0, dp(6)); // Maintained top padding to keep icons near top

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
                showLoadingOverlay();
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
        
        // Use margins instead of padding to resize the WebView
        // This physically shrinks the WebView window so it ends above the bottom bar
        ViewGroup.LayoutParams params = webView.getLayoutParams();
        if (params instanceof ViewGroup.MarginLayoutParams) {
            ViewGroup.MarginLayoutParams marginParams = (ViewGroup.MarginLayoutParams) params;
            // Set bottom margin to height of bottom bar (102dp)
            marginParams.setMargins(
                marginParams.leftMargin, 
                marginParams.topMargin, 
                marginParams.rightMargin, 
                dp(102)
            );
            webView.setLayoutParams(marginParams);
        }
    }

    private int dp(int value) {
        float density = getResources().getDisplayMetrics().density;
        return Math.round(value * density);
    }

    private void hideNativeSplash() {
        // Handle Splash Overlay
        if (splashOverlay != null && !splashHidden) {
            splashHidden = true;
            splashOverlay.animate()
                .alpha(0f)
                .setDuration(300)
                .withEndAction(() -> {
                    splashOverlay.setVisibility(View.GONE);
                    if (bottomBar != null) {
                        bottomBar.setVisibility(View.VISIBLE);
                    }
                })
                .start();
        }
        
        // Handle Loading Overlay
        if (loadingOverlay != null && loadingOverlay.getVisibility() == View.VISIBLE) {
             loadingOverlay.animate()
                .alpha(0f)
                .setDuration(300)
                .withEndAction(() -> loadingOverlay.setVisibility(View.GONE))
                .start();
        }
    }
}

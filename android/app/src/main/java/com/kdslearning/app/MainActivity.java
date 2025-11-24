package com.kdslearning.app;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.ValueAnimator;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.DecelerateInterpolator;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import androidx.annotation.DrawableRes;
import androidx.annotation.Nullable;
import androidx.core.content.ContextCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class MainActivity extends BridgeActivity {

    private final List<TabViewHolder> tabs = new ArrayList<>();
    private LinearLayout bottomBar;
    private LinearLayout tabRow;
    private ProgressBar loadingSpinner;
    private View loadingOverlay;
    private View nativeSplashOverlay;
    private ProgressBar splashProgressBar;
    private boolean splashAnimationDone = false;
    private boolean webViewReady = false;
    private int currentTab = 0;
    private int systemBottomInset = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        setupChromeClient();
        setupCustomUi();
        startSplashProgress();
    }

    private void setupChromeClient() {
        // Wrap the default Capacitor chrome client so we can toggle the loading overlay.
        WebView webView = getBridge().getWebView();
        if (webView == null) {
            return;
        }

        webView.setWebChromeClient(
            new BridgeWebChromeClient(getBridge()) {
                @Override
                public void onProgressChanged(WebView view, int newProgress) {
                    super.onProgressChanged(view, newProgress);
                    if (newProgress < 100) {
                        if (!isShowingNativeSplash()) {
                            showLoadingOverlay();
                        }
                    } else {
                        webViewReady = true;
                        hideLoadingOverlay();
                        maybeHideNativeSplash();
                    }
                    syncTabWithUrl(view.getUrl());
                }
            }
        );
    }

    private void setupCustomUi() {
        ViewGroup content = findViewById(android.R.id.content);
        ViewGroup existingRoot = content;
        if (content.getChildCount() > 0 && content.getChildAt(0) instanceof ViewGroup) {
            existingRoot = (ViewGroup) content.getChildAt(0);
        }

        addNativeSplashOverlay(content);
        addLoadingOverlay(content);
        addBottomBar(content);
        if (bottomBar != null) {
            bottomBar.setVisibility(View.GONE); // keep nav hidden until splash completes
        }

        // Apply initial padding to keep the web content above the nav.
        existingRoot.post(this::applyWebViewPadding);
        getWindow().setStatusBarColor(ContextCompat.getColor(this, R.color.brand_surface));
        getWindow().setNavigationBarColor(Color.WHITE);
    }

    private void addLoadingOverlay(ViewGroup root) {
        FrameLayout overlay = new FrameLayout(this);
        overlay.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        overlay.setBackgroundColor(Color.parseColor("#99FFFFFF"));
        overlay.setClickable(true);
        overlay.setVisibility(View.GONE);

        ProgressBar spinner = new ProgressBar(this, null, android.R.attr.progressBarStyleLarge);
        FrameLayout.LayoutParams spinnerParams = new FrameLayout.LayoutParams(
            dp(48),
            dp(48),
            Gravity.CENTER
        );
        spinner.setLayoutParams(spinnerParams);

        overlay.addView(spinner);
        root.addView(overlay);

        loadingOverlay = overlay;
        loadingSpinner = spinner;
    }

    private void addNativeSplashOverlay(ViewGroup root) {
        View splash = getLayoutInflater().inflate(R.layout.native_splash_overlay, root, false);
        splash.setVisibility(View.VISIBLE);
        splashProgressBar = splash.findViewById(R.id.splashProgress);
        nativeSplashOverlay = splash;
        root.addView(splash);
        splash.bringToFront();
    }

    private void addBottomBar(ViewGroup root) {
        bottomBar = new LinearLayout(this);
        bottomBar.setOrientation(LinearLayout.VERTICAL);
        bottomBar.setBackgroundColor(Color.WHITE);
        bottomBar.setElevation(dp(6));

        LinearLayout.LayoutParams barParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        bottomBar.setLayoutParams(barParams);

        // Thin divider line
        View border = new View(this);
        border.setLayoutParams(new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            1
        ));
        border.setBackgroundColor(Color.parseColor("#D0C5BE"));
        bottomBar.addView(border);

        tabRow = new LinearLayout(this);
        tabRow.setOrientation(LinearLayout.HORIZONTAL);
        tabRow.setGravity(Gravity.CENTER);
        tabRow.setPadding(dp(6), dp(6), dp(6), dp(10));
        tabRow.setWeightSum(4f);
        tabRow.setLayoutParams(new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dp(88)
        ));

        bottomBar.addView(tabRow);

        addTab("Home", R.drawable.tab_home, "/", 0);
        addTab("Programs", R.drawable.tab_programs, "/courses", 1);
        addTab("E-Books", R.drawable.tab_ebooks, "/ebooks", 2);
        addTab("Dashboard", R.drawable.tab_dashboard, "/dashboard", 3);

        ViewGroup.MarginLayoutParams params;
        if (root instanceof FrameLayout) {
            params = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM
            );
        } else if (root instanceof androidx.coordinatorlayout.widget.CoordinatorLayout) {
            androidx.coordinatorlayout.widget.CoordinatorLayout.LayoutParams lp =
                new androidx.coordinatorlayout.widget.CoordinatorLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                );
            lp.gravity = Gravity.BOTTOM;
            params = lp;
        } else {
            FrameLayout.LayoutParams frameParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            );
            frameParams.gravity = Gravity.BOTTOM;
            params = frameParams;
        }
        root.addView(bottomBar, params);

        ViewCompat.setOnApplyWindowInsetsListener(
            bottomBar,
            (v, insets) -> {
                systemBottomInset = insets.getInsets(WindowInsetsCompat.Type.systemBars()).bottom;
                v.setPadding(v.getPaddingLeft(), v.getPaddingTop(), v.getPaddingRight(), systemBottomInset);
                applyWebViewPadding();
                return insets;
            }
        );

        updateTabSelection();
    }

    private void addTab(String title, @DrawableRes int iconRes, String path, int tag) {
        LinearLayout container = new LinearLayout(this);
        container.setOrientation(LinearLayout.VERTICAL);
        container.setGravity(Gravity.CENTER);
        container.setLayoutParams(new LinearLayout.LayoutParams(
            0,
            ViewGroup.LayoutParams.MATCH_PARENT,
            1f
        ));

        ImageView icon = new ImageView(this);
        LinearLayout.LayoutParams iconParams = new LinearLayout.LayoutParams(dp(24), dp(24));
        icon.setLayoutParams(iconParams);
        icon.setImageResource(iconRes);

        TextView label = new TextView(this);
        LinearLayout.LayoutParams labelParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        labelParams.topMargin = dp(4);
        label.setLayoutParams(labelParams);
        label.setGravity(Gravity.CENTER_HORIZONTAL);
        label.setTextAlignment(View.TEXT_ALIGNMENT_CENTER);
        label.setText(title);
        label.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        label.setTextColor(ContextCompat.getColor(this, R.color.brand_inactive));

        container.addView(icon);
        container.addView(label);
        container.setOnClickListener(v -> onTabSelected(tag, path));

        tabRow.addView(container);
        tabs.add(new TabViewHolder(container, icon, label, path));
    }

    private void onTabSelected(int tag, String path) {
        currentTab = tag;
        updateTabSelection();
        showLoadingOverlay();
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            String js = "window.location.href = '" + path + "';";
            webView.evaluateJavascript(js, null);
        }
    }

    private void updateTabSelection() {
        int active = ContextCompat.getColor(this, R.color.brand_primary);
        int inactive = ContextCompat.getColor(this, R.color.brand_inactive);

        for (int i = 0; i < tabs.size(); i++) {
            TabViewHolder tab = tabs.get(i);
            boolean isActive = (i == currentTab);
            int color = isActive ? active : inactive;
            tab.icon.setColorFilter(color);
            tab.label.setTextColor(color);
        }
    }

    private void syncTabWithUrl(@Nullable String url) {
        if (url == null) return;
        try {
            Uri uri = Uri.parse(url);
            String path = uri.getPath();
            if (path == null) return;
            String p = path.toLowerCase(Locale.US);
            int nextTab = currentTab;
            if (p.startsWith("/courses")) {
                nextTab = 1;
            } else if (p.startsWith("/ebooks")) {
                nextTab = 2;
            } else if (p.startsWith("/dashboard")) {
                nextTab = 3;
            } else {
                nextTab = 0;
            }
            if (nextTab != currentTab) {
                currentTab = nextTab;
                updateTabSelection();
            }
        } catch (Exception ignore) {
            // no-op
        }
    }

    private void applyWebViewPadding() {
        WebView webView = getBridge().getWebView();
        if (webView == null || bottomBar == null) return;

        int visibleBarHeight = bottomBar.getVisibility() == View.VISIBLE ? bottomBar.getHeight() : 0;
        int bottomPadding = visibleBarHeight + systemBottomInset;
        webView.setPadding(webView.getPaddingLeft(), webView.getPaddingTop(), webView.getPaddingRight(), bottomPadding);
        webView.setClipToPadding(false);
        if (loadingOverlay != null) {
            loadingOverlay.bringToFront();
        }
        if (nativeSplashOverlay != null) {
            nativeSplashOverlay.bringToFront();
        }
        bottomBar.bringToFront();
    }

    private void showLoadingOverlay() {
        if (isShowingNativeSplash()) return;
        if (loadingOverlay == null || loadingSpinner == null) return;
        loadingOverlay.setVisibility(View.VISIBLE);
        loadingSpinner.setVisibility(View.VISIBLE);
        loadingSpinner.bringToFront();
        loadingOverlay.bringToFront();
        if (bottomBar != null) {
            bottomBar.bringToFront();
        }
    }

    private void startSplashProgress() {
        if (splashProgressBar == null) return;
        splashProgressBar.setIndeterminate(false);
        splashProgressBar.setMax(100);
        splashProgressBar.setProgress(0);

        ValueAnimator animator = ValueAnimator.ofInt(0, 100);
        animator.setDuration(5000);
        animator.setInterpolator(new DecelerateInterpolator());
        animator.addUpdateListener(animation -> {
            Integer value = (Integer) animation.getAnimatedValue();
            splashProgressBar.setProgress(value);
        });
        animator.addListener(new AnimatorListenerAdapter() {
            @Override
            public void onAnimationEnd(Animator animation) {
                splashAnimationDone = true;
                maybeHideNativeSplash();
            }
        });
        animator.start();
    }

    private void maybeHideNativeSplash() {
        if (!isShowingNativeSplash()) return;
        if (!splashAnimationDone || !webViewReady) return;

        nativeSplashOverlay.animate()
            .alpha(0f)
            .setDuration(300)
            .setListener(new AnimatorListenerAdapter() {
                @Override
                public void onAnimationEnd(Animator animation) {
                    nativeSplashOverlay.setVisibility(View.GONE);
                    nativeSplashOverlay.setAlpha(1f);
                    if (bottomBar != null) {
                        bottomBar.setVisibility(View.VISIBLE);
                        applyWebViewPadding();
                    }
                    nativeSplashOverlay = null;
                }
            })
            .start();
    }

    private boolean isShowingNativeSplash() {
        return nativeSplashOverlay != null && nativeSplashOverlay.getVisibility() == View.VISIBLE;
    }

    private void hideLoadingOverlay() {
        if (loadingOverlay == null || loadingSpinner == null) return;
        loadingSpinner.setVisibility(View.GONE);
        loadingOverlay.setVisibility(View.GONE);
    }

    private int dp(int value) {
        return Math.round(
            TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP,
                value,
                getResources().getDisplayMetrics()
            )
        );
    }

    private static class TabViewHolder {
        final View root;
        final ImageView icon;
        final TextView label;
        final String path;

        TabViewHolder(View root, ImageView icon, TextView label, String path) {
            this.root = root;
            this.icon = icon;
            this.label = label;
            this.path = path;
        }
    }
}

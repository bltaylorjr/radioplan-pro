package com.radioplan.pro;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.view.View;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.io.ByteArrayOutputStream;
import java.util.HashMap;
import java.util.List;
import android.telephony.TelephonyManager;
import android.telephony.CellInfo;
import android.telephony.CellInfoLte;
import android.telephony.CellInfoGsm;
import android.telephony.CellInfoWcdma;
import android.telephony.CellInfoCdma;
import android.net.wifi.WifiManager;
import android.net.wifi.WifiInfo;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Map;

/**
 * LvPlan Pro for Android: the full app runs offline from the APK's assets, served on a private https
 * origin so that built-in storage (IndexedDB), GPS and the camera work as in a browser.
 */
public class MainActivity extends Activity {
    static final String HOST = "app.radioplan.local";
    static final String START = "https://" + HOST + "/index.html";
    static final int REQ_FILE = 1, REQ_SAVE = 2, REQ_PERM_GEO = 3, REQ_PERM_CAM = 4;

    WebView web;
    ValueCallback<Uri[]> fileCallback;
    byte[] pendingSave;
    String geoOrigin; GeolocationPermissions.Callback geoCallback;
    PermissionRequest camRequest;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setGeolocationEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setTextZoom(100);
        s.setUserAgentString(s.getUserAgentString() + " RadioPlanAndroid/1.0");
        web.addJavascriptInterface(new Bridge(), "RadioPlanAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (!HOST.equals(u.getHost())) return null;
                String path = u.getPath();
                if (path == null || path.equals("/") || path.isEmpty()) path = "/index.html";
                try {
                    InputStream in = getAssets().open("www" + path);
                    WebResourceResponse res = new WebResourceResponse(mime(path), "utf-8", in);
                    Map<String, String> h = new HashMap<>();
                    h.put("Cache-Control", "no-cache");
                    res.setResponseHeaders(h);
                    return res;
                } catch (IOException e) {
                    return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, null);
                }
            }
            @SuppressWarnings("deprecation")
            @Override public boolean shouldOverrideUrlLoading(WebView v, String url) {
                Uri u = Uri.parse(url);
                if (HOST.equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (ActivityNotFoundException e) { /* ignore */ }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {
                if (has(Manifest.permission.ACCESS_FINE_LOCATION)) { cb.invoke(origin, true, true); return; }
                geoOrigin = origin; geoCallback = cb;
                requestPermissions(new String[] { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }, REQ_PERM_GEO);
            }
            @Override public void onPermissionRequest(final PermissionRequest req) {
                runOnUiThread(new Runnable() { public void run() {
                    boolean wantsCam = false;
                    for (String r : req.getResources()) if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) wantsCam = true;
                    if (!wantsCam) { req.deny(); return; }
                    if (has(Manifest.permission.CAMERA)) { req.grant(new String[] { PermissionRequest.RESOURCE_VIDEO_CAPTURE }); return; }
                    camRequest = req; requestPermissions(new String[] { Manifest.permission.CAMERA }, REQ_PERM_CAM);
                }});
            }
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                if (p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try { startActivityForResult(Intent.createChooser(i, "Choose file"), REQ_FILE); }
                catch (ActivityNotFoundException e) { fileCallback = null; return false; }
                return true;
            }
        });
        if (state != null) web.restoreState(state); else web.loadUrl(START);
    }

    boolean has(String perm) { return checkSelfPermission(perm) == PackageManager.PERMISSION_GRANTED; }

    static String mime(String p) {
        p = p.toLowerCase();
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js")) return "text/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".wasm")) return "application/wasm";
        return "application/octet-stream";
    }

    @Override public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        boolean ok = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
        if (code == REQ_PERM_GEO && geoCallback != null) { geoCallback.invoke(geoOrigin, ok, ok); geoCallback = null; }
        if (code == REQ_PERM_CAM && camRequest != null) {
            if (ok) camRequest.grant(new String[] { PermissionRequest.RESOURCE_VIDEO_CAPTURE }); else camRequest.deny();
            camRequest = null;
        }
    }

    @Override protected void onActivityResult(int code, int result, Intent data) {
        if (code == REQ_FILE) {
            Uri[] out = null;
            if (result == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int n = data.getClipData().getItemCount(); out = new Uri[n];
                    for (int k = 0; k < n; k++) out[k] = data.getClipData().getItemAt(k).getUri();
                } else if (data.getData() != null) out = new Uri[] { data.getData() };
            }
            if (fileCallback != null) fileCallback.onReceiveValue(out);
            fileCallback = null;
        } else if (code == REQ_SAVE) {
            if (result == RESULT_OK && data != null && data.getData() != null && pendingSave != null) {
                try (OutputStream o = getContentResolver().openOutputStream(data.getData())) {
                    o.write(pendingSave); toast("Saved");
                } catch (Exception e) { toast("Could not save: " + e.getMessage()); }
            }
            pendingSave = null;
        }
    }

    void toast(final String m) { runOnUiThread(new Runnable() { public void run() { Toast.makeText(MainActivity.this, m, Toast.LENGTH_SHORT).show(); } }); }

    /** Called from the page: window.RadioPlanAndroid.saveFile / shareFile. */
    class Bridge {
        /** The phone's own signal for the Live Signal Readings page: every cell heard (dBm) and the Wi-Fi link. */
        @JavascriptInterface public String phoneSignal() {
            JSONObject out = new JSONObject();
            try {
                JSONArray cells = new JSONArray();
                if (!has(Manifest.permission.ACCESS_FINE_LOCATION) && !has(Manifest.permission.ACCESS_COARSE_LOCATION)) {
                    runOnUiThread(new Runnable() { public void run() { requestPermissions(new String[] { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }, REQ_PERM_GEO); } });
                    out.put("error", "Allow Location for LvPlan Pro so it can read the phone's signal, then try again.");
                } else {
                    TelephonyManager tm = (TelephonyManager) getSystemService(TELEPHONY_SERVICE);
                    List<CellInfo> all = tm == null ? null : tm.getAllCellInfo();
                    if (all != null) for (CellInfo ci : all) {
                        JSONObject c = new JSONObject(); c.put("registered", ci.isRegistered());
                        if (ci instanceof CellInfoLte) { c.put("tech", "LTE"); c.put("dbm", ((CellInfoLte) ci).getCellSignalStrength().getDbm()); c.put("id", "PCI " + ((CellInfoLte) ci).getCellIdentity().getPci()); }
                        else if (ci instanceof CellInfoWcdma) { c.put("tech", "3G"); c.put("dbm", ((CellInfoWcdma) ci).getCellSignalStrength().getDbm()); }
                        else if (ci instanceof CellInfoGsm) { c.put("tech", "2G"); c.put("dbm", ((CellInfoGsm) ci).getCellSignalStrength().getDbm()); }
                        else if (ci instanceof CellInfoCdma) { c.put("tech", "CDMA"); c.put("dbm", ((CellInfoCdma) ci).getCellSignalStrength().getDbm()); }
                        else continue;
                        cells.put(c);
                    }
                    WifiManager wm = (WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
                    WifiInfo wi = wm == null ? null : wm.getConnectionInfo();
                    if (wi != null && wi.getNetworkId() != -1) { JSONObject w = new JSONObject(); w.put("ssid", String.valueOf(wi.getSSID()).replace("\"", "")); w.put("dbm", wi.getRssi()); w.put("mhz", wi.getFrequency()); out.put("wifi", w); }
                }
                out.put("cells", cells);
            } catch (Exception e) { try { out.put("error", "Could not read the phone's signal: " + e.getMessage()); } catch (Exception ignored) { } }
            return out.toString();
        }
        @JavascriptInterface public void saveFile(final String name, final String mime, String b64) {
            pendingSave = Base64.decode(b64, Base64.DEFAULT);
            runOnUiThread(new Runnable() { public void run() {
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType(mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
                i.putExtra(Intent.EXTRA_TITLE, name);
                try { startActivityForResult(i, REQ_SAVE); } catch (ActivityNotFoundException e) { toast("No app available to save files"); }
            }});
        }
        @JavascriptInterface public void httpPost(String id, String url, String body, String soapAction) { rrHttp(id, url, body == null ? "" : body, soapAction); }
        @JavascriptInterface public void httpGet(String id, String url) { rrHttp(id, url, null, null); }
        /** One read from a Wi-Fi field device on the local network (http:// page or tcp:// stream). */
        @JavascriptInterface public void lanRead(String id, String url) { lanReadImpl(id, url); }
        @JavascriptInterface public void shareFile(final String name, final String mime, String b64, final String text) {
            try {
                File dir = new File(getCacheDir(), "share"); dir.mkdirs();
                String safe = name.replaceAll("[^A-Za-z0-9._-]", "_");
                File f = new File(dir, safe);
                try (FileOutputStream o = new FileOutputStream(f)) { o.write(Base64.decode(b64, Base64.DEFAULT)); }
                final Uri u = Uri.parse("content://" + ShareProvider.AUTHORITY + "/" + safe);
                runOnUiThread(new Runnable() { public void run() {
                    Intent i = new Intent(Intent.ACTION_SEND);
                    i.setType(mime);
                    i.putExtra(Intent.EXTRA_STREAM, u);
                    i.putExtra(Intent.EXTRA_TEXT, text);
                    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(Intent.createChooser(i, "Share LvPlan file"));
                }});
            } catch (IOException e) { toast("Could not share: " + e.getMessage()); }
        }
    }

    /** RadioReference.com web service: the page can't call it directly (no CORS), so the app does. Only that host. */
    void rrHttp(final String id, final String url, final String body, final String soapAction) {
        new Thread(new Runnable() { public void run() {
            boolean ok = false; byte[] out;
            try {
                if (!url.startsWith("https://api.radioreference.com/") || url.contains("..") || url.contains("@")) throw new IOException("Address refused");
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setConnectTimeout(30000); c.setReadTimeout(60000);
                c.setRequestProperty("User-Agent", "LvPlanPro");
                if (body != null) {
                    c.setRequestMethod("POST"); c.setDoOutput(true);
                    c.setRequestProperty("Content-Type", "text/xml; charset=utf-8");
                    c.setRequestProperty("SOAPAction", soapAction == null ? "" : soapAction);
                    try (OutputStream o = c.getOutputStream()) { o.write(body.getBytes("UTF-8")); }
                }
                int code = c.getResponseCode();
                InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
                ByteArrayOutputStream b = new ByteArrayOutputStream();
                if (in != null) { byte[] buf = new byte[16384]; int n; while ((n = in.read(buf)) > 0) b.write(buf, 0, n); in.close(); }
                out = b.toByteArray();
                String text = new String(out, "UTF-8");
                ok = code < 400 || text.contains("Fault");
                if (!ok) out = ("RadioReference HTTP " + code).getBytes("UTF-8");
                c.disconnect();
            } catch (Exception e) {
                String m = "No connection to RadioReference (" + e.getMessage() + ")";
                try { out = m.getBytes("UTF-8"); } catch (Exception x) { out = new byte[0]; }
            }
            final String js = "window.__rrHttpDone&&window.__rrHttpDone('" + id.replaceAll("[^A-Za-z0-9]", "") + "'," + ok + ",'" + Base64.encodeToString(out, Base64.NO_WRAP) + "')";
            runOnUiThread(new Runnable() { public void run() { web.evaluateJavascript(js, null); } });
        }}).start();
    }

    static boolean lanOk(String host) {
        if (host.endsWith(".local")) return true;
        String[] p = host.split("\\.");
        if (p.length != 4) return false;
        try {
            int a = Integer.parseInt(p[0]), b = Integer.parseInt(p[1]);
            for (String x : p) { int v = Integer.parseInt(x); if (v < 0 || v > 255) return false; }
            return a == 10 || (a == 172 && b >= 16 && b <= 31) || (a == 192 && b == 168) || (a == 169 && b == 254);
        } catch (NumberFormatException e) { return false; }
    }
    void lanReadImpl(final String id, final String url) {
        new Thread(new Runnable() { public void run() {
            boolean ok = false; byte[] out;
            try {
                String rest = url.contains("://") ? url.substring(url.indexOf("://") + 3) : "";
                String hostport = rest.split("/")[0], host = hostport.split(":")[0];
                if (url.contains("@") || url.contains("..") || !lanOk(host)) throw new IOException("Use the device's local address (192.168.x.x, 10.x.x.x).");
                ByteArrayOutputStream b = new ByteArrayOutputStream();
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                    c.setConnectTimeout(4000); c.setReadTimeout(5000);
                    InputStream in = c.getInputStream(); byte[] buf = new byte[8192]; int n;
                    while ((n = in.read(buf)) > 0 && b.size() < 65536) b.write(buf, 0, n);
                    in.close(); c.disconnect();
                } else if (url.startsWith("tcp://")) {
                    int port = hostport.contains(":") ? Integer.parseInt(hostport.split(":")[1]) : 10110;
                    java.net.Socket so = new java.net.Socket();
                    so.connect(new java.net.InetSocketAddress(host, port), 4000); so.setSoTimeout(400);
                    InputStream in = so.getInputStream(); byte[] buf = new byte[2048]; long start = System.currentTimeMillis();
                    while (System.currentTimeMillis() - start < 1200 && b.size() < 16384) {
                        try { int n = in.read(buf); if (n < 0) break; b.write(buf, 0, n); } catch (java.net.SocketTimeoutException t) { if (b.size() > 0) break; }
                    }
                    so.close();
                } else throw new IOException("Use http:// or tcp://");
                out = b.toByteArray(); ok = true;
            } catch (Exception e) {
                String m = "The device did not answer (" + e.getMessage() + ")";
                try { out = m.getBytes("UTF-8"); } catch (Exception x) { out = new byte[0]; }
            }
            final String js = "window.__lanDone&&window.__lanDone('" + id.replaceAll("[^A-Za-z0-9]", "") + "'," + ok + ",'" + Base64.encodeToString(out, Base64.NO_WRAP) + "')";
            runOnUiThread(new Runnable() { public void run() { web.evaluateJavascript(js, null); } });
        }}).start();
    }

    @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }
    @Override protected void onPause() { super.onPause(); web.onPause(); }
    @Override protected void onResume() { super.onResume(); web.onResume(); }
}

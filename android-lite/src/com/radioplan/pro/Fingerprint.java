package com.radioplan.pro;

import android.content.Context;
import android.hardware.fingerprint.FingerprintManager;
import android.os.CancellationSignal;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Fingerprint sign-in for LvPlan Pro users. Each user's data key is locked by an Android Keystore key
 * that the phone only lets the app use right after a fingerprint matches (the key never leaves the
 * phone's secure hardware). Built against API 23 (FingerprintManager), so it also runs on newer phones.
 */
class Fingerprint {
    interface Done { void done(boolean ok, String payload); }
    static final String STORE = "AndroidKeyStore";
    final Context ctx;
    CancellationSignal cancel;
    Fingerprint(Context c) { ctx = c; }

    FingerprintManager fm() {
        try { return (FingerprintManager) ctx.getSystemService(Context.FINGERPRINT_SERVICE); } catch (Throwable t) { return null; }
    }
    /** yes, not-enrolled or none */
    String available() {
        try {
            FingerprintManager f = fm();
            if (f == null || !f.isHardwareDetected()) return "none";
            if (!f.hasEnrolledFingerprints()) return "not-enrolled";
            return "yes";
        } catch (SecurityException e) { return "none"; } catch (Throwable t) { return "none"; }
    }
    SecretKey key(String alias, boolean create) throws Exception {
        KeyStore ks = KeyStore.getInstance(STORE); ks.load(null);
        if (ks.containsAlias(alias) && !create) return (SecretKey) ks.getKey(alias, null);
        if (ks.containsAlias(alias)) ks.deleteEntry(alias);
        KeyGenerator g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, STORE);
        g.init(new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256).setUserAuthenticationRequired(true).build());
        return g.generateKey();
    }
    void remove(String alias) { try { KeyStore ks = KeyStore.getInstance(STORE); ks.load(null); if (ks.containsAlias(alias)) ks.deleteEntry(alias); } catch (Exception e) { /* already gone */ } }
    void stop() { if (cancel != null) { cancel.cancel(); cancel = null; } }

    /** New key, then a fingerprint, then the data key is locked. Payload: {"iv":"..","ct":".."} */
    void enroll(String alias, final String dataKeyB64, final Done d) {
        try {
            final Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, key(alias, true));
            listen(c, new Done() { public void done(boolean ok, String p) {
                if (!ok) { d.done(false, p); return; }
                try {
                    byte[] ct = c.doFinal(Base64.decode(dataKeyB64, Base64.NO_WRAP));
                    d.done(true, "{\"iv\":\"" + Base64.encodeToString(c.getIV(), Base64.NO_WRAP) + "\",\"ct\":\"" + Base64.encodeToString(ct, Base64.NO_WRAP) + "\"}");
                } catch (Exception e) { d.done(false, "Could not lock the key: " + e.getMessage()); }
            }});
        } catch (Exception e) { d.done(false, "Fingerprint set-up failed: " + e.getMessage()); }
    }
    /** Fingerprint, then the data key is unlocked. Payload: data key in base64. */
    void unlock(String alias, String ivB64, final String ctB64, final Done d) {
        try {
            SecretKey k = key(alias, false);
            if (k == null) { d.done(false, "Fingerprint sign-in is not set up on this phone. Use your PIN or password"); return; }
            final Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, k, new GCMParameterSpec(128, Base64.decode(ivB64, Base64.NO_WRAP)));
            listen(c, new Done() { public void done(boolean ok, String p) {
                if (!ok) { d.done(false, p); return; }
                try { d.done(true, Base64.encodeToString(c.doFinal(Base64.decode(ctB64, Base64.NO_WRAP)), Base64.NO_WRAP)); }
                catch (Exception e) { d.done(false, "Could not unlock: " + e.getMessage()); }
            }});
        } catch (KeyPermanentlyInvalidatedException e) {
            remove(alias); d.done(false, "The fingerprints on this phone changed, so fingerprint sign-in was turned off. Use your PIN or password, then set it up again");
        } catch (Exception e) { d.done(false, "Fingerprint sign-in failed: " + e.getMessage()); }
    }
    void listen(Cipher c, final Done d) {
        FingerprintManager f = fm();
        if (f == null) { d.done(false, "No fingerprint sensor"); return; }
        stop(); cancel = new CancellationSignal();
        try {
            f.authenticate(new FingerprintManager.CryptoObject(c), cancel, 0, new FingerprintManager.AuthenticationCallback() {
                @Override public void onAuthenticationSucceeded(FingerprintManager.AuthenticationResult r) { cancel = null; d.done(true, ""); }
                @Override public void onAuthenticationError(int code, CharSequence msg) { cancel = null; d.done(false, code == FingerprintManager.FINGERPRINT_ERROR_CANCELED ? "Cancelled" : String.valueOf(msg)); }
                @Override public void onAuthenticationFailed() { /* not a match: keep waiting for another touch */ }
            }, null);
        } catch (SecurityException e) { d.done(false, "The app is not allowed to use the fingerprint sensor"); }
    }
}

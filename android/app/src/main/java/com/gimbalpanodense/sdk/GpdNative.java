package com.gimbalpanodense.sdk;

/** Synchronous CPU pipeline. Call on a worker thread; native jobs are serialized. */
public final class GpdNative {
    static { System.loadLibrary("gpd_android"); }
    private GpdNative() {}
    /** Paths must be filesystem directories readable and writable by the caller. */
    public static native String runProject(String projectDir, String resourceDir,
                                            String mode, String profile);
}

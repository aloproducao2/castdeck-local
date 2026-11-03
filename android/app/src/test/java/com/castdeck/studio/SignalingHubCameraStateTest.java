package com.castdeck.studio;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/**
 * Contrato de estado do painel Câmeras no Android. O servidor Java precisa preservar os mesmos
 * campos que o Node envia para o host; sem isso, o painel abre vazio no APK.
 */
public class SignalingHubCameraStateTest {
    @Test
    public void cameraCapsControlsAndInterfacesSurvive() throws Exception {
        JSONObject raw = new JSONObject()
                .put("name", "Celular")
                .put("cam", true)
                .put("camCaps", new JSONObject()
                        .put("zoom", new JSONObject().put("min", 1).put("max", 4).put("step", 0.1))
                        .put("iso", new JSONObject().put("min", 100).put("max", 3200))
                        .put("focusMode", new JSONArray().put("continuous").put("manual"))
                        .put("torch", true)
                        .put("lixo", new JSONObject().put("min", 1).put("max", 2)))
                .put("camCtl", new JSONObject()
                        .put("zoom", 2)
                        .put("iso", 800)
                        .put("focusMode", "manual")
                        .put("torch", true)
                        .put("lixo", 99))
                .put("camVideoDevices", new JSONArray()
                        .put(new JSONObject().put("id", "cam-traseira").put("label", "Traseira").put("x", 1)))
                .put("camAudioDevices", new JSONArray()
                        .put(new JSONObject().put("id", "mic-1").put("label", "Microfone")))
                .put("camVideoId", "cam-traseira")
                .put("camAudioId", "mic-1")
                .put("injected", "não deve passar");

        JSONObject out = SignalingHub.cleanState(raw);

        assertFalse(out.has("injected"));
        JSONObject caps = out.getJSONObject("camCaps");
        assertEquals(1.0, caps.getJSONObject("zoom").getDouble("min"), 0.0001);
        assertEquals(4.0, caps.getJSONObject("zoom").getDouble("max"), 0.0001);
        assertEquals(2, caps.getJSONArray("focusMode").length());
        assertTrue(caps.getBoolean("torch"));
        assertFalse(caps.has("lixo"));

        JSONObject ctl = out.getJSONObject("camCtl");
        assertEquals(2.0, ctl.getDouble("zoom"), 0.0001);
        assertEquals(800.0, ctl.getDouble("iso"), 0.0001);
        assertEquals("manual", ctl.getString("focusMode"));
        assertTrue(ctl.getBoolean("torch"));
        assertFalse(ctl.has("lixo"));

        JSONArray videos = out.getJSONArray("camVideoDevices");
        assertEquals(1, videos.length());
        assertEquals("cam-traseira", videos.getJSONObject(0).getString("id"));
        assertFalse(videos.getJSONObject(0).has("x"));
        assertEquals("mic-1", out.getString("camAudioId"));
    }

    @Test
    public void invalidCameraPayloadIsIgnoredSafely() throws Exception {
        JSONObject out = SignalingHub.cleanState(new JSONObject()
                .put("camCaps", "inválido")
                .put("camCtl", JSONObject.NULL)
                .put("camVideoDevices", new JSONArray().put(JSONObject.NULL)));

        assertFalse(out.has("camCaps"));
        assertFalse(out.has("camCtl"));
        assertEquals(0, out.getJSONArray("camVideoDevices").length());
    }
}

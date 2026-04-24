import React, {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useCallback,
} from "react";
import * as realtimeService from "../services/realtimeService";
import AsyncStorage from "@react-native-async-storage/async-storage";

const MqttContext = createContext();

const mqttReducer = (state, action) => {
  switch (action.type) {
    case "MESSAGE": {
      const { topic, data } = action.payload;

      if (!data || typeof data !== "object") return state;

      const parts = topic.split("/");
      if (parts.length < 3 || parts[0] !== "poulailler") return state;

      // ✅ FIX : parts[1] est la macAddress (ex: "142B2FC7D704")
      //         On l'utilise comme clé dans le state MQTT.
      //         Le mapping macAddress → poulaillerId est géré côté composant
      //         (via usePoultryState qui connaît les deux).
      const macAddress = parts[1];
      if (!macAddress) return state;

      const newPoultryState = state[macAddress] || {};

      if (parts[2] === "status") {
        newPoultryState.status = data;
      } else if (parts[2] === "measures") {
        newPoultryState.measures = data;
      } else {
        return state;
      }

      return { ...state, [macAddress]: newPoultryState };
    }
    case "CONNECT":
      return { ...state, connected: true };
    case "DISCONNECT":
      return { ...state, connected: false };
    default:
      return state;
  }
};

export const MqttProvider = ({ children }) => {
  const [state, dispatch] = useReducer(mqttReducer, { connected: false });

  useEffect(() => {
    let isMounted = true;

    const initRealtime = async () => {
      try {
        const userToken = await AsyncStorage.getItem("userToken");

        if (!userToken || !isMounted) {
          console.log("[MqttContext] No token, skipping realtime init");
          return;
        }

        await realtimeService.connect(userToken);

        // ✅ FIX : le serveur doit envoyer la macAddress dans le payload
        //         Exemple attendu : { macAddress: "142B2FC7D704", temperature: 25, ... }
        realtimeService.onMeasures((data) => {
          if (isMounted && data.macAddress) {
            const topic = `poulailler/${data.macAddress}/measures`;
            dispatch({ type: "MESSAGE", payload: { topic, data } });
          }
        });

        realtimeService.onStatus((data) => {
          if (isMounted && data.macAddress) {
            const topic = `poulailler/${data.macAddress}/status`;
            dispatch({ type: "MESSAGE", payload: { topic, data } });
          }
        });

        dispatch({ type: "CONNECT" });
      } catch (e) {
        console.warn("[MqttContext] initRealtime error:", e);
        dispatch({ type: "DISCONNECT" });
      }
    };

    initRealtime();

    realtimeService.socket?.on("connect", () => {
      if (isMounted) dispatch({ type: "CONNECT" });
    });
    realtimeService.socket?.on("disconnect", () => {
      if (isMounted) dispatch({ type: "DISCONNECT" });
    });
    realtimeService.socket?.on("connect_error", () => {
      if (isMounted) dispatch({ type: "DISCONNECT" });
    });

    return () => {
      isMounted = false;
      realtimeService.disconnect();
      dispatch({ type: "DISCONNECT" });
    };
  }, []);

  // ✅ FIX : subscribe prend maintenant la macAddress (pas le poulaillerId)
  //         Appeler avec : subscribe(macAddress)  ex: subscribe("142B2FC7D704")
  const subscribe = useCallback((macAddress) => {
    realtimeService.joinPoulailler(macAddress);
  }, []);

  // ✅ FIX : sendCommand utilise la macAddress dans le topic
  //         Appeler avec : sendCommand(macAddress, command, value)
  const sendCommand = useCallback((macAddress, command, value = null) => {
    realtimeService.sendCommand(macAddress, command, value);
  }, []);

  return (
    <MqttContext.Provider value={{ state, dispatch, subscribe, sendCommand }}>
      {children}
    </MqttContext.Provider>
  );
};

export const useMqtt = () => useContext(MqttContext);

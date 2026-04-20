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

      const poultryId = parts[1];
      if (!poultryId) return state;

      const newPoultryState = state[poultryId] || {};

      if (parts[2] === "status") {
        newPoultryState.status = data;
      } else if (parts[2] === "measures") {
        newPoultryState.measures = data;
      } else {
        return state;
      }

      return { ...state, [poultryId]: newPoultryState };
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
        realtimeService.onMeasures((data) => {
          if (isMounted && data.poulaillerId) {
            const topic = `poulailler/${data.poulaillerId}/measures`;
            dispatch({ type: "MESSAGE", payload: { topic, data: data } });
          }
        });
        realtimeService.onStatus((data) => {
          if (isMounted && data.poulaillerId) {
            const topic = `poulailler/${data.poulaillerId}/status`;
            dispatch({ type: "MESSAGE", payload: { topic, data: data } });
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

  const subscribe = useCallback((poultryId) => {
    realtimeService.joinPoulailler(poultryId);
  }, []);

  const sendCommand = useCallback((poultryId, command, value = null) => {
    realtimeService.sendCommand(poultryId, command, value);
  }, []);

  return (
    <MqttContext.Provider value={{ state, dispatch, subscribe, sendCommand }}>
      {children}
    </MqttContext.Provider>
  );
};

export const useMqtt = () => useContext(MqttContext);

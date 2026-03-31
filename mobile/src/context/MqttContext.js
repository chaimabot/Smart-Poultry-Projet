import React, {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useCallback,
} from "react";
// ✅ Import correct : connectMqtt et subscribePoultry en named, disconnectMqtt en default
import mqttService, {
  connectMqtt,
  subscribePoultry,
  disconnectMqtt,
} from "../services/mqttService";
import AsyncStorage from "@react-native-async-storage/async-storage";

const MqttContext = createContext();

const mqttReducer = (state, action) => {
  switch (action.type) {
    case "MESSAGE": {
      const { topic, data } = action.payload;

      // SAFETY: Skip malformed data
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

    const initMqtt = async () => {
      try {
        const userToken = await AsyncStorage.getItem("userToken");
        const userId = (await AsyncStorage.getItem("userId")) || "guest";

        if (!userToken || !isMounted) return;

        await connectMqtt(userToken, userId, (topic, data) => {
          if (isMounted) {
            dispatch({ type: "MESSAGE", payload: { topic, data } });
          }
        });

        dispatch({ type: "CONNECT" });
      } catch (e) {
        console.warn("[MqttContext] initMqtt error:", e);
      }
    };

    initMqtt();

    return () => {
      isMounted = false;
      disconnectMqtt();
      dispatch({ type: "DISCONNECT" });
    };
  }, []);

  const subscribe = useCallback((poultryId) => {
    subscribePoultry(poultryId);
  }, []);

  return (
    <MqttContext.Provider value={{ state, dispatch, subscribe }}>
      {children}
    </MqttContext.Provider>
  );
};

export const useMqtt = () => useContext(MqttContext);

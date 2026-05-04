import AppNavigator from "./src/navigation/AppNavigator";
import { ThemeProvider } from "./src/context/ThemeContext";
import { NotificationsProvider } from "./src/context/NotificationsContext";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { MqttProvider } from "./src/context/MqttContext";

export default function App() {
  return (
    <SafeAreaProvider>
      <MqttProvider>
        <NotificationsProvider>
          <ThemeProvider>
            <AppNavigator />
          </ThemeProvider>
        </NotificationsProvider>
      </MqttProvider>
    </SafeAreaProvider>
  );
}

import AppNavigator from "./src/navigation/AppNavigator";
import { ThemeProvider } from "./src/context/ThemeContext";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { MqttProvider } from "./src/context/MqttContext";

export default function App() {
  return (
    <SafeAreaProvider>
      <MqttProvider>
        <ThemeProvider>
          <AppNavigator />
        </ThemeProvider>
      </MqttProvider>
    </SafeAreaProvider>
  );
}

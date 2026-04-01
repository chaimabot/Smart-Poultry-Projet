import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import LoginScreen from "../features/auth/screens/LoginScreen";
import RegisterScreen from "../features/auth/screens/RegisterScreen";
import DashboardScreen from "../features/poultry/screens/DashboardScreen";
import AddPoultryScreen from "../features/poultry/screens/AddPoultryScreen";
import ProfileScreen from "../features/profile/screens/ProfileScreen";
import PoultryDetailScreen from "../features/poultry/screens/PoultryDetailScreen";
import AlertSettingsScreen from "../features/poultry/screens/AlertSettingsScreen";
import ArchivedPoultriesScreen from "../features/poultry/screens/Archivedpoultriesscreen";
import HistoryScreen from "../features/poultry/screens/HistoryScreen";

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen name="Dashboard" component={DashboardScreen} />
        <Stack.Screen name="AddPoultry" component={AddPoultryScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="PoultryDetail" component={PoultryDetailScreen} />
        <Stack.Screen
          name="AlertSettingsScreen"
          component={AlertSettingsScreen}
        />
        <Stack.Screen
          name="ArchivedPoultries"
          component={ArchivedPoultriesScreen}
        />
        <Stack.Screen name="History" component={HistoryScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

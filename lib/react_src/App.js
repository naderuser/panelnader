import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { AuthProvider } from "./src/context/AuthContext";

import TeacherLoginScreen from "./src/screens/TeacherLoginScreen";
import TeacherDashboard from "./src/screens/TeacherDashboard";
import StudentLoginScreen from "./src/screens/StudentLoginScreen";
import StudentExamScreen from "./src/screens/StudentExamScreen";

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="StudentLogin"
          screenOptions={{ headerShown: false, animation: "slide_from_right" }}
        >
          <Stack.Screen name="StudentLogin" component={StudentLoginScreen} />
          <Stack.Screen name="StudentExam" component={StudentExamScreen} />
          <Stack.Screen name="TeacherLogin" component={TeacherLoginScreen} />
          <Stack.Screen name="TeacherDashboard" component={TeacherDashboard} />
        </Stack.Navigator>
      </NavigationContainer>
    </AuthProvider>
  );
}

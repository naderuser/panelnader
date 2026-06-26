import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Image
} from "react-native";
import { teacherLogin } from "../utils/api";
import { useAuth } from "../context/AuthContext";

export default function TeacherLoginScreen({ navigation }) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleLogin = async () => {
    if (!password.trim()) {
      Alert.alert("خطا", "رمز عبور را وارد کنید");
      return;
    }
    setLoading(true);
    try {
      const { status, data } = await teacherLogin(password);
      if (data.ok) {
        // ذخیره کوکی احراز هویت
        const cookieVal = `t_auth=${await hashSHA256(password)}`;
        await login(cookieVal);
        navigation.replace("TeacherDashboard");
      } else {
        Alert.alert("خطا", data.error || "ورود ناموفق");
      }
    } catch (e) {
      Alert.alert("خطا", "خطا در اتصال به سرور");
    } finally {
      setLoading(false);
    }
  };

  async function hashSHA256(text) {
    // برای React Native از این روش استفاده می‌کنیم
    // در نصب واقعی از کتابخانه react-native-sha256 استفاده کنید
    return text; // placeholder — در نسخه واقعی hash واقعی استفاده کنید
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.card}>
        <Text style={styles.icon}>🎓</Text>
        <Text style={styles.title}>پنل آموزشی جامع</Text>
        <Text style={styles.subtitle}>ورود معلم</Text>

        <TextInput
          style={styles.input}
          placeholder="رمز عبور"
          placeholderTextColor="#aaa"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={handleLogin}
          textAlign="right"
        />

        <TouchableOpacity style={styles.btn} onPress={handleLogin} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>ورود</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkBtn}
          onPress={() => navigation.navigate("StudentLogin")}
        >
          <Text style={styles.linkText}>دانش‌آموز هستم ←</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f0f4ff",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
    shadowColor: "#667eea",
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  icon: { fontSize: 56, marginBottom: 8 },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#667eea",
    marginBottom: 4,
    textAlign: "center",
  },
  subtitle: { fontSize: 14, color: "#888", marginBottom: 28 },
  input: {
    width: "100%",
    height: 50,
    borderWidth: 1.5,
    borderColor: "#ddd",
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: "#333",
    backgroundColor: "#fafafa",
    marginBottom: 16,
    writingDirection: "rtl",
  },
  btn: {
    width: "100%",
    height: 50,
    backgroundColor: "#667eea",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  btnText: { color: "#fff", fontSize: 17, fontWeight: "bold" },
  linkBtn: { padding: 8 },
  linkText: { color: "#667eea", fontSize: 14 },
});

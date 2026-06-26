import React, { useState, useCallback } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  SafeAreaView, Alert
} from "react-native";
import { useAuth } from "../context/AuthContext";
import StudentsTab from "./teacher/StudentsTab";
import QuestionsTab from "./teacher/QuestionsTab";
import SubmissionsTab from "./teacher/SubmissionsTab";
import AiChatTab from "./teacher/AiChatTab";
import SettingsTab from "./teacher/SettingsTab";

const TABS = [
  { key: "students", label: "دانش‌آموزان", icon: "👩‍🎓" },
  { key: "questions", label: "سوالات", icon: "📝" },
  { key: "submissions", label: "پاسخنامه‌ها", icon: "📋" },
  { key: "ai", label: "دستیار AI", icon: "🤖" },
  { key: "settings", label: "تنظیمات", icon: "⚙️" },
];

export default function TeacherDashboard({ navigation }) {
  const [activeTab, setActiveTab] = useState("students");
  const { cookie, logout } = useAuth();

  const handleLogout = () => {
    Alert.alert("خروج", "آیا مطمئن هستید؟", [
      { text: "انصراف", style: "cancel" },
      {
        text: "خروج",
        style: "destructive",
        onPress: async () => {
          await logout();
          navigation.replace("TeacherLogin");
        },
      },
    ]);
  };

  const renderTab = () => {
    switch (activeTab) {
      case "students": return <StudentsTab cookie={cookie} />;
      case "questions": return <QuestionsTab cookie={cookie} />;
      case "submissions": return <SubmissionsTab cookie={cookie} />;
      case "ai": return <AiChatTab cookie={cookie} />;
      case "settings": return <SettingsTab cookie={cookie} onLogout={handleLogout} navigation={navigation} />;
      default: return null;
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* هدر */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>خروج</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🎓 پنل معلم</Text>
      </View>

      {/* محتوا */}
      <View style={styles.content}>{renderTab()}</View>

      {/* تب‌بار پایین */}
      <View style={styles.tabBar}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tabItem, activeTab === tab.key && styles.tabItemActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={styles.tabIcon}>{tab.icon}</Text>
            <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f5f7ff" },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#667eea",
  },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  logoutBtn: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  logoutText: { color: "#fff", fontSize: 13 },
  content: { flex: 1 },
  tabBar: {
    flexDirection: "row-reverse",
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#eee",
    paddingBottom: 4,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderTopWidth: 2,
    borderTopColor: "transparent",
  },
  tabItemActive: { borderTopColor: "#667eea" },
  tabIcon: { fontSize: 20 },
  tabLabel: { fontSize: 10, color: "#aaa", marginTop: 2 },
  tabLabelActive: { color: "#667eea", fontWeight: "bold" },
});

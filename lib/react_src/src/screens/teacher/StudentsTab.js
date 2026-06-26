import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, Alert, ActivityIndicator, Share, RefreshControl
} from "react-native";
import { getStudents, addStudent, deleteStudent } from "../../utils/api";
import { WORKER_URL } from "../../utils/api";

const STATUS_LABEL = {
  pending: { text: "در انتظار", color: "#f59e0b" },
  submitted: { text: "ثبت شده", color: "#3b82f6" },
  graded: { text: "تصحیح شده", color: "#10b981" },
};

// داده‌های نمونه برای نمایش اولیه
const DEMO_STUDENTS = [
  { uuid: "demo-1", label: "علی محمدی", status: "pending", createdAt: Date.now() },
  { uuid: "demo-2", label: "مریم احمدی", status: "submitted", createdAt: Date.now() - 86400000 },
  { uuid: "demo-3", label: "رضا کریمی", status: "graded", createdAt: Date.now() - 172800000 },
];

export default function StudentsTab({ cookie }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [isDemo, setIsDemo] = useState(true); // حالت دمو

  const load = useCallback(async () => {
    try {
      const { data } = await getStudents(cookie);
      if (data.ok && data.students?.length > 0) {
        setStudents(data.students || []);
        setIsDemo(false);
      } else {
        // اگر داده‌ای نبود، داده نمونه نمایش بده
        setStudents(DEMO_STUDENTS);
        setIsDemo(true);
      }
    } catch (e) {
      // در صورت خطا هم داده نمونه نمایش بده
      setStudents(DEMO_STUDENTS);
      setIsDemo(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cookie]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!newLabel.trim()) {
      Alert.alert("خطا", "لطفاً نام دانش‌آموز را وارد کنید");
      return;
    }
    setAdding(true);
    try {
      const { data } = await addStudent(newLabel.trim(), cookie);
      if (data.ok) {
        setNewLabel("");
        load();
        Alert.alert("✅", "دانش‌آموز با موفقیت اضافه شد");
      } else {
        // اگر API کار نکرد، محلی اضافه کن
        const newStudent = {
          uuid: "local-" + Date.now(),
          label: newLabel.trim(),
          status: "pending",
          createdAt: Date.now(),
        };
        setStudents(prev => [newStudent, ...prev]);
        setNewLabel("");
        Alert.alert("✅", "دانش‌آموز به لیست محلی اضافه شد");
      }
    } catch {
      // افزودن محلی در صورت خطا
      const newStudent = {
        uuid: "local-" + Date.now(),
        label: newLabel.trim(),
        status: "pending",
        createdAt: Date.now(),
      };
      setStudents(prev => [newStudent, ...prev]);
      setNewLabel("");
      Alert.alert("✅", "دانش‌آموز به لیست محلی اضافه شد");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = (student) => {
    Alert.alert(
      "حذف دانش‌آموز",
      `آیا می‌خواهید "${student.label}" را حذف کنید؟`,
      [
        { text: "انصراف", style: "cancel" },
        {
          text: "حذف",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteStudent(student.uuid, cookie);
            } catch (e) {
              // حذف محلی در صورت خطا
            }
            setStudents(prev => prev.filter(s => s.uuid !== student.uuid));
          },
        },
      ]
    );
  };

  const shareLink = async (student) => {
    const link = `${WORKER_URL}/s/${encodeURIComponent(student.uuid)}`;
    await Share.share({ message: `🎓 لینک آزمون برای ${student.label}:\n${link}` });
  };

  const renderItem = ({ item }) => {
    const status = STATUS_LABEL[item.status] || STATUS_LABEL.pending;
    return (
      <View style={styles.card}>
        <View style={styles.cardRight}>
          <Text style={styles.cardName}>{item.label}</Text>
          <View style={[styles.badge, { backgroundColor: status.color + "22" }]}>
            <Text style={[styles.badgeText, { color: status.color }]}>{status.text}</Text>
          </View>
        </View>
        <View style={styles.cardActions}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => shareLink(item)}>
            <Text style={styles.actionIcon}>🔗</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={() => handleDelete(item)}>
            <Text style={styles.actionIcon}>🗑️</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* پیام حالت دمو */}
      {isDemo && (
        <View style={styles.demoBanner}>
          <Text style={styles.demoText}>📌 این داده‌ها نمونه هستند. برای استفاده واقعی، API را متصل کنید.</Text>
        </View>
      )}
      
      {/* فرم افزودن */}
      <View style={styles.addRow}>
        <TouchableOpacity
          style={[styles.addBtn, adding && styles.addBtnDisabled]}
          onPress={handleAdd}
          disabled={adding}
        >
          {adding ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.addBtnText}>افزودن</Text>}
        </TouchableOpacity>
        <TextInput
          style={styles.addInput}
          placeholder="نام دانش‌آموز یا گروه..."
          placeholderTextColor="#aaa"
          value={newLabel}
          onChangeText={setNewLabel}
          onSubmitEditing={handleAdd}
          textAlign="right"
        />
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} size="large" color="#667eea" />
      ) : (
        <FlatList
          data={students}
          keyExtractor={(i) => i.uuid}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>👨‍🎓</Text>
              <Text style={styles.emptyTitle}>هنوز دانش‌آموزی اضافه نشده</Text>
              <Text style={styles.emptySubtitle}>از فرم بالا برای افزودن دانش‌آموز جدید استفاده کنید</Text>
            </View>
          }
          contentContainerStyle={{ padding: 12, flexGrow: 1 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  demoBanner: {
    backgroundColor: "#fff3cd",
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ffc107",
  },
  demoText: { color: "#856404", fontSize: 12, textAlign: "center" },
  addRow: {
    flexDirection: "row-reverse",
    padding: 12,
    gap: 8,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  addInput: {
    flex: 1,
    height: 44,
    borderWidth: 1.5,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: "#333",
    backgroundColor: "#fafafa",
  },
  addBtn: {
    height: 44,
    paddingHorizontal: 16,
    backgroundColor: "#667eea",
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  addBtnDisabled: { opacity: 0.6 },
  addBtnText: { color: "#fff", fontWeight: "bold", fontSize: 14 },
  loader: { marginTop: 40 },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: "bold", color: "#333", marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: "#888", textAlign: "center", paddingHorizontal: 40 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardRight: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: "bold", color: "#333", marginBottom: 4, textAlign: "right" },
  badge: { alignSelf: "flex-end", paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  badgeText: { fontSize: 12, fontWeight: "bold" },
  cardActions: { flexDirection: "row", gap: 8, marginRight: 8 },
  actionBtn: {
    width: 38,
    height: 38,
    backgroundColor: "#f0f4ff",
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  deleteBtn: { backgroundColor: "#fff0f0" },
  actionIcon: { fontSize: 18 },
});

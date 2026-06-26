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

export default function StudentsTab({ cookie }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await getStudents(cookie);
      if (data.ok) setStudents(data.students || []);
    } catch (e) {
      Alert.alert("خطا", "خطا در بارگذاری دانش‌آموزان");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cookie]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!newLabel.trim()) return;
    setAdding(true);
    try {
      const { data } = await addStudent(newLabel.trim(), cookie);
      if (data.ok) {
        setNewLabel("");
        load();
      } else {
        Alert.alert("خطا", data.error || "خطا در افزودن");
      }
    } catch {
      Alert.alert("خطا", "خطا در اتصال");
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
              load();
            } catch {
              Alert.alert("خطا", "خطا در حذف");
            }
          },
        },
      ]
    );
  };

  const shareLink = async (student) => {
    const link = `${WORKER_URL}/s/${encodeURIComponent(student.uuid)}`;
    await Share.share({ message: `لینک آزمون ${student.label}:\n${link}` });
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
            <Text style={styles.empty}>هنوز دانش‌آموزی اضافه نشده است</Text>
          }
          contentContainerStyle={{ padding: 12 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  empty: { textAlign: "center", color: "#aaa", marginTop: 40, fontSize: 15 },
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

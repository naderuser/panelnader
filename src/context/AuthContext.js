import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [cookie, setCookie] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem("t_auth_cookie").then((v) => {
      if (v) setCookie(v);
      setLoading(false);
    });
  }, []);

  const login = async (cookieValue) => {
    setCookie(cookieValue);
    await AsyncStorage.setItem("t_auth_cookie", cookieValue);
  };

  const logout = async () => {
    setCookie(null);
    await AsyncStorage.removeItem("t_auth_cookie");
  };

  return (
    <AuthContext.Provider value={{ cookie, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

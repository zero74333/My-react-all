import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as SQLite from 'expo-sqlite';

const databasePromise = SQLite.openDatabaseAsync('counter.db');

function formatTime(value) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function App() {
  const [count, setCount] = useState(0);
  const [history, setHistory] = useState([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      try {
        const db = await databasePromise;
        await db.execAsync(`
          PRAGMA journal_mode = WAL;
          CREATE TABLE IF NOT EXISTS counter_state (
            id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
            value INTEGER NOT NULL
          );
          CREATE TABLE IF NOT EXISTS counter_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            value_after INTEGER NOT NULL,
            created_at TEXT NOT NULL
          );
          INSERT OR IGNORE INTO counter_state (id, value) VALUES (1, 0);
        `);

        const row = await db.getFirstAsync(
          'SELECT value FROM counter_state WHERE id = 1'
        );
        const rows = await db.getAllAsync(
          'SELECT id, action, value_after, created_at FROM counter_history ORDER BY id DESC LIMIT 10'
        );

        if (mounted) {
          setCount(row ? row.value : 0);
          setHistory(rows);
          setReady(true);
        }
      } catch (e) {
        if (mounted) {
          setError(String(e?.message || e));
          setReady(true);
        }
      }
    }

    initialize();
    return () => {
      mounted = false;
    };
  }, []);

  const refreshHistory = useCallback(async (db) => {
    const rows = await db.getAllAsync(
      'SELECT id, action, value_after, created_at FROM counter_history ORDER BY id DESC LIMIT 10'
    );
    setHistory(rows);
  }, []);

  async function changeCount(action) {
    if (busy || !ready || error) return;
    setBusy(true);
    setError('');
    try {
      const db = await databasePromise;
      const row = await db.getFirstAsync(
        'SELECT value FROM counter_state WHERE id = 1'
      );
      const oldValue = row ? row.value : 0;
      let nextValue = oldValue;

      if (action === 'increment') nextValue += 1;
      if (action === 'decrement') nextValue -= 1;
      if (action === 'reset') nextValue = 0;

      await db.withExclusiveTransactionAsync(async (tx) => {
        await tx.runAsync(
          'UPDATE counter_state SET value = ? WHERE id = 1',
          nextValue
        );
        await tx.runAsync(
          'INSERT INTO counter_history (action, value_after, created_at) VALUES (?, ?, ?)',
          action,
          nextValue,
          new Date().toISOString()
        );
      });

      setCount(nextValue);
      await refreshHistory(db);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function clearHistory() {
    if (busy || !ready || error) return;
    setBusy(true);
    setError('');
    try {
      const db = await databasePromise;
      await db.runAsync('DELETE FROM counter_history');
      setHistory([]);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <SafeAreaView style={styles.loading}>
        <StatusBar barStyle="dark-content" />
        <ActivityIndicator size="large" color="#2457D6" />
        <Text style={styles.loadingText}>Opening SQLite database…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4F6FB" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.eyebrow}>REACT NATIVE • SQLITE TEST</Text>
        <Text style={styles.title}>Counter</Text>
        <Text style={styles.subtitle}>
          Your count and action history are stored locally in SQLite.
        </Text>

        <View style={styles.counterCard}>
          <Text style={styles.counterLabel}>CURRENT COUNT</Text>
          <Text accessibilityLabel={`Current count ${count}`} style={styles.count}>
            {count}
          </Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              accessibilityRole="button"
              disabled={busy || !!error}
              onPress={() => changeCount('decrement')}
              style={[styles.button, styles.secondaryButton, (busy || !!error) && styles.disabled]}
            >
              <Text style={styles.secondaryButtonText}>− 1</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              disabled={busy || !!error}
              onPress={() => changeCount('increment')}
              style={[styles.button, styles.primaryButton, (busy || !!error) && styles.disabled]}
            >
              <Text style={styles.primaryButtonText}>+ 1</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            disabled={busy || !!error}
            onPress={() => changeCount('reset')}
            style={[styles.resetButton, (busy || !!error) && styles.disabled]}
          >
            <Text style={styles.resetText}>Reset counter</Text>
          </TouchableOpacity>
          <Text style={styles.persistenceNote}>
            Close and reopen the app to test persistence.
          </Text>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Database error</Text>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.historyHeader}>
          <View>
            <Text style={styles.sectionTitle}>Recent activity</Text>
            <Text style={styles.sectionSubtitle}>Last 10 saved actions</Text>
          </View>
          <TouchableOpacity disabled={busy || history.length === 0} onPress={clearHistory}>
            <Text style={[styles.clearText, (busy || history.length === 0) && styles.faded]}>
              Clear
            </Text>
          </TouchableOpacity>
        </View>

        {history.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No activity yet</Text>
            <Text style={styles.emptyText}>Tap +1, −1 or Reset to save your first record.</Text>
          </View>
        ) : (
          history.map((item) => (
            <View key={item.id} style={styles.historyItem}>
              <View style={styles.historyIcon}>
                <Text style={styles.historyIconText}>
                  {item.action === 'increment' ? '+' : item.action === 'decrement' ? '−' : '↺'}
                </Text>
              </View>
              <View style={styles.historyMain}>
                <Text style={styles.historyAction}>
                  {item.action === 'increment'
                    ? 'Increment'
                    : item.action === 'decrement'
                    ? 'Decrement'
                    : 'Reset'}
                </Text>
                <Text style={styles.historyDate}>{formatTime(item.created_at)}</Text>
              </View>
              <Text style={styles.historyValue}>{item.value_after}</Text>
            </View>
          ))
        )}

        <Text style={styles.footer}>Offline • Local database • No account required</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F6FB' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F6FB' },
  loadingText: { marginTop: 12, color: '#536078', fontSize: 15 },
  container: { padding: 22, paddingBottom: 36 },
  eyebrow: { color: '#2457D6', fontSize: 11, fontWeight: '800', letterSpacing: 1.7, marginTop: 12 },
  title: { color: '#172033', fontSize: 34, fontWeight: '800', marginTop: 8 },
  subtitle: { color: '#68748A', fontSize: 14, lineHeight: 21, marginTop: 7, marginBottom: 24 },
  counterCard: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 22, borderWidth: 1, borderColor: '#E6EAF2' },
  counterLabel: { color: '#7B879B', fontSize: 11, fontWeight: '800', letterSpacing: 1.5, textAlign: 'center' },
  count: { color: '#172033', fontSize: 76, fontWeight: '800', textAlign: 'center', marginVertical: 16, fontVariant: ['tabular-nums'] },
  buttonRow: { flexDirection: 'row', gap: 12 },
  button: { flex: 1, minHeight: 54, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  primaryButton: { backgroundColor: '#2457D6' },
  secondaryButton: { backgroundColor: '#EAF0FF' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  secondaryButtonText: { color: '#2457D6', fontSize: 18, fontWeight: '800' },
  disabled: { opacity: 0.45 },
  resetButton: { marginTop: 12, minHeight: 44, borderRadius: 13, borderWidth: 1, borderColor: '#E0E5EF', alignItems: 'center', justifyContent: 'center' },
  resetText: { color: '#59667C', fontWeight: '700', fontSize: 14 },
  persistenceNote: { color: '#8993A5', textAlign: 'center', fontSize: 11, marginTop: 16 },
  errorBox: { marginTop: 16, padding: 14, borderRadius: 12, backgroundColor: '#FFF0F0', borderWidth: 1, borderColor: '#F3CACA' },
  errorTitle: { color: '#A32929', fontWeight: '800', marginBottom: 4 },
  errorText: { color: '#842525', fontSize: 12 },
  historyHeader: { marginTop: 28, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: '#172033', fontSize: 19, fontWeight: '800' },
  sectionSubtitle: { color: '#7B879B', fontSize: 12, marginTop: 3 },
  clearText: { color: '#2457D6', fontWeight: '700', fontSize: 13 },
  faded: { opacity: 0.35 },
  emptyCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#E6EAF2' },
  emptyTitle: { color: '#344057', fontWeight: '700', fontSize: 14 },
  emptyText: { color: '#7B879B', fontSize: 12, lineHeight: 18, marginTop: 5 },
  historyItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 15, padding: 13, marginBottom: 8, borderWidth: 1, borderColor: '#E9EDF4' },
  historyIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  historyIconText: { color: '#2457D6', fontSize: 20, fontWeight: '800' },
  historyMain: { flex: 1 },
  historyAction: { color: '#273249', fontWeight: '700', fontSize: 13 },
  historyDate: { color: '#8A94A6', fontSize: 10, marginTop: 4 },
  historyValue: { color: '#172033', fontSize: 17, fontWeight: '800', marginLeft: 10 },
  footer: { color: '#9AA3B2', textAlign: 'center', fontSize: 11, marginTop: 24 },
});

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, ActivityIndicator,
  RefreshControl, Alert, Platform, Image, KeyboardAvoidingView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { http } from '../../src/api';

type Entry = {
  id: string; entry_type: 'busco' | 'repetido'; quantity: number;
  card: { number: number; player_name?: string; card_type: string };
  collection: { id: string; name: string; season: string };
};
type Collection = { id: string; name: string; season: string; total_cards?: number };

function notify(title: string, msg: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.alert(`${title}\n\n${msg}`);
  } else {
    Alert.alert(title, msg);
  }
}

type Special = { player_name: string; card_type: 'ballondor' | 'special' };

export default function Cambios() {
  const [tab, setTab] = useState<'busco' | 'repetido'>('busco');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(false);
  const [modal, setModal] = useState(false);
  const [search, setSearch] = useState('');

  // form
  const [mode, setMode] = useState<'numeros' | 'especial'>('numeros');
  const [colId, setColId] = useState('');
  const [selectedNumbers, setSelectedNumbers] = useState<Set<number>>(new Set());
  const [rangeMax, setRangeMax] = useState(100);
  const [specialName, setSpecialName] = useState('');
  const [specialType, setSpecialType] = useState<'ballondor' | 'special'>('special');
  const [specials, setSpecials] = useState<Special[]>([]);
  const [qty, setQty] = useState('1');
  const [submitting, setSubmitting] = useState(false);

  // new collection inline
  const [newColMode, setNewColMode] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColSeason, setNewColSeason] = useState('');
  const [newColTotal, setNewColTotal] = useState('100');

  // AI extraction modal
  const [aiModal, setAiModal] = useState(false);
  const [aiImage, setAiImage] = useState<string | null>(null); // base64
  const [aiPreview, setAiPreview] = useState<string | null>(null); // data uri for <Image>
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSrcMode, setAiSrcMode] = useState<'lista' | 'cromos'>('lista');
  const [aiNumbers, setAiNumbers] = useState<number[]>([]);
  const [aiSpecials, setAiSpecials] = useState<Special[]>([]);
  const [aiNewNum, setAiNewNum] = useState('');
  const [aiNewName, setAiNewName] = useState('');

  const load = useCallback(async () => {
    try {
      const [eR, cR] = await Promise.all([
        http.get<Entry[]>(`/entries/me?entry_type=${tab}`),
        http.get<Collection[]>('/collections'),
      ]);
      setEntries(eR.data);
      setCollections(cR.data);
      if (!colId && cR.data.length > 0) {
        setColId(cR.data[0].id);
        if (cR.data[0].total_cards) setRangeMax(cR.data[0].total_cards);
      }
    } catch { /* ignore */ }
    finally {
      setLoading(false);
      setRefresh(false);
    }
  }, [tab, colId]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => {
      const num = String(e.card.number || '');
      const pname = (e.card.player_name || '').toLowerCase();
      const cname = (e.collection.name || '').toLowerCase();
      return num.includes(q) || pname.includes(q) || cname.includes(q);
    });
  }, [entries, search]);

  const toggleNumber = (n: number) => {
    setSelectedNumbers((prev) => {
      const s = new Set(prev);
      if (s.has(n)) s.delete(n); else s.add(n);
      return s;
    });
  };

  const selectRange = (from: number, to: number) => {
    setSelectedNumbers((prev) => {
      const s = new Set(prev);
      for (let i = from; i <= to; i++) s.add(i);
      return s;
    });
  };

  const addSpecial = () => {
    const name = specialName.trim();
    if (!name) return;
    if (specials.some((x) => x.player_name.toLowerCase() === name.toLowerCase() && x.card_type === specialType)) return;
    setSpecials((p) => [...p, { player_name: name, card_type: specialType }]);
    setSpecialName('');
  };

  const removeSpecial = (idx: number) => {
    setSpecials((p) => p.filter((_, i) => i !== idx));
  };

  const resetForm = () => {
    setSelectedNumbers(new Set());
    setSpecials([]);
    setSpecialName('');
    setQty('1');
    setNewColMode(false);
    setNewColName(''); setNewColSeason(''); setNewColTotal('100');
    setMode('numeros');
  };

  // --- AI extraction ---
  const openAi = () => {
    setAiImage(null);
    setAiPreview(null);
    setAiNumbers([]);
    setAiSpecials([]);
    setAiSrcMode('lista');
    setAiNewNum('');
    setAiNewName('');
    setAiModal(true);
  };

  const pickImage = async () => {
    try {
      if (Platform.OS !== 'web') {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          notify('Permiso requerido', 'Concede acceso a la galería para subir fotos.');
          return;
        }
      }
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.7,
        base64: true,
      });
      if (r.canceled || !r.assets || r.assets.length === 0) return;
      const a = r.assets[0];
      let b64 = a.base64 || '';
      if (!b64 && a.uri && a.uri.startsWith('data:')) {
        b64 = a.uri.split(',', 2)[1] || '';
      }
      if (!b64) return notify('Error', 'No se pudo leer la imagen.');
      setAiImage(b64);
      setAiPreview(a.uri || `data:image/jpeg;base64,${b64}`);
      setAiNumbers([]);
      setAiSpecials([]);
    } catch (e: any) {
      notify('Error', e?.message || 'No se pudo abrir el selector');
    }
  };

  const takePhoto = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        notify('Permiso requerido', 'Concede acceso a la cámara para hacer fotos.');
        return;
      }
      const r = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        base64: true,
      });
      if (r.canceled || !r.assets || r.assets.length === 0) return;
      const a = r.assets[0];
      const b64 = a.base64 || '';
      if (!b64) return notify('Error', 'No se pudo leer la foto.');
      setAiImage(b64);
      setAiPreview(a.uri || `data:image/jpeg;base64,${b64}`);
      setAiNumbers([]);
      setAiSpecials([]);
    } catch (e: any) {
      notify('Error', e?.message || 'No se pudo abrir la cámara');
    }
  };

  const analyze = async () => {
    if (!aiImage) return notify('Atención', 'Selecciona una imagen primero.');
    setAiLoading(true);
    try {
      const r = await http.post<{ numbers: number[]; specials: Special[]; warning?: string }>(
        '/ai/extract-list', { image_base64: aiImage, mode: aiSrcMode }, { timeout: 60000 }
      );
      setAiNumbers(r.data.numbers || []);
      setAiSpecials(r.data.specials || []);
      if ((r.data as any).warning) notify('Aviso', (r.data as any).warning);
      else if ((r.data.numbers || []).length === 0 && (r.data.specials || []).length === 0) {
        notify('Sin resultados', 'La IA no detectó números ni nombres. Prueba con mejor luz o más cerca.');
      }
    } catch (e: any) {
      notify('Error IA', e?.response?.data?.detail || 'Error analizando la imagen');
    } finally {
      setAiLoading(false);
    }
  };

  const aiAddNumber = () => {
    const n = parseInt(aiNewNum, 10);
    if (isNaN(n) || n <= 0) return;
    if (!aiNumbers.includes(n)) setAiNumbers([...aiNumbers, n].sort((a, b) => a - b));
    setAiNewNum('');
  };
  const aiRemoveNumber = (n: number) => setAiNumbers(aiNumbers.filter((x) => x !== n));

  const aiAddSpecial = (type: 'ballondor' | 'special') => {
    const name = aiNewName.trim();
    if (!name) return;
    if (!aiSpecials.find((s) => s.player_name.toLowerCase() === name.toLowerCase())) {
      setAiSpecials([...aiSpecials, { player_name: name, card_type: type }]);
    }
    setAiNewName('');
  };
  const aiRemoveSpecial = (idx: number) => setAiSpecials(aiSpecials.filter((_, i) => i !== idx));

  const confirmAi = () => {
    // Mezclar resultados IA en el formulario
    setSelectedNumbers((p) => {
      const s = new Set(p);
      aiNumbers.forEach((n) => s.add(n));
      return s;
    });
    if (aiNumbers.length > 0) {
      const maxN = Math.max(...aiNumbers, rangeMax);
      if (maxN > rangeMax) setRangeMax(Math.min(maxN, 500));
    }
    setSpecials((p) => {
      const map = new Map(p.map((sp) => [`${sp.player_name.toLowerCase()}|${sp.card_type}`, sp]));
      aiSpecials.forEach((sp) => {
        const k = `${sp.player_name.toLowerCase()}|${sp.card_type}`;
        if (!map.has(k)) map.set(k, sp);
      });
      return Array.from(map.values());
    });
    notify('Importado', `${aiNumbers.length} números y ${aiSpecials.length} especiales añadidos. Revisa y guarda.`);
    setAiModal(false);
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      let cId = colId;
      if (newColMode) {
        if (!newColName.trim() || !newColSeason.trim()) {
          notify('Atención', 'Nombre y temporada obligatorios.');
          setSubmitting(false); return;
        }
        const total = parseInt(newColTotal, 10) || 0;
        const r = await http.post<Collection>('/collections', {
          name: newColName.trim(), season: newColSeason.trim(), total_cards: total,
        });
        cId = r.data.id;
        setCollections((p) => [r.data, ...p]);
        setColId(cId);
        if (total) setRangeMax(total);
        setNewColMode(false);
      }
      if (!cId) {
        notify('Atención', 'Elige o crea una colección.');
        setSubmitting(false); return;
      }
      const numbersArr = Array.from(selectedNumbers);
      if (numbersArr.length === 0 && specials.length === 0) {
        notify('Atención', 'Selecciona al menos un cromo.');
        setSubmitting(false); return;
      }
      const quantity = Math.max(1, parseInt(qty, 10) || 1);
      const r = await http.post('/entries/bulk', {
        collection_id: cId,
        entry_type: tab,
        numbers: numbersArr,
        specials,
        quantity,
      });
      const { created, skipped, errors } = r.data;
      let msg = `Creados: ${created}`;
      if (skipped) msg += ` · Omitidos: ${skipped}`;
      if (errors && errors.length) msg += `\nAvisos: ${errors.slice(0, 3).join('; ')}`;
      notify('Hecho', msg);
      resetForm();
      setModal(false);
      await load();
    } catch (e: any) {
      notify('Error', e?.response?.data?.detail || 'No se pudo guardar');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await http.delete(`/entries/${id}`);
      setEntries((p) => p.filter((e) => e.id !== id));
    } catch (e: any) {
      notify('Error', e?.response?.data?.detail || 'No se pudo eliminar');
    }
  };

  const currentCol = collections.find((c) => c.id === colId);

  return (
    <View style={s.wrap}>
      <View style={s.tabs}>
        <TouchableOpacity testID="tab-busco" style={[s.tab, tab === 'busco' && s.tabActive]} onPress={() => setTab('busco')}>
          <Text style={[s.tabTxt, tab === 'busco' && s.tabTxtActive]}>🔍 Busco</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="tab-repetido" style={[s.tab, tab === 'repetido' && s.tabActive]} onPress={() => setTab('repetido')}>
          <Text style={[s.tabTxt, tab === 'repetido' && s.tabTxtActive]}>📦 Repetidos</Text>
        </TouchableOpacity>
      </View>

      <View style={{ paddingHorizontal: 16 }}>
        <TextInput
          style={s.search} value={search} onChangeText={setSearch}
          placeholder="Buscar por número, jugador, colección..." placeholderTextColor="#64748b"
        />
      </View>

      {loading ? (
        <ActivityIndicator color="#22c55e" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); load(); }} tintColor="#22c55e" />}
        >
          {filtered.length === 0 ? (
            <Text style={s.empty}>
              {entries.length === 0
                ? `Aún no tienes entradas en ${tab}. Pulsa el botón + para añadir.`
                : 'Sin resultados para tu búsqueda.'}
            </Text>
          ) : (
            filtered.map((e) => {
              const isSpecial = e.card.card_type !== 'normal';
              const icon = e.card.card_type === 'ballondor' ? '🏆' : e.card.card_type === 'special' ? '⭐' : '';
              const label = isSpecial
                ? `${icon} ${e.card.player_name || 'Especial'}`
                : `#${e.card.number}${e.card.player_name ? ` · ${e.card.player_name}` : ''}`;
              return (
                <View key={e.id} style={s.row} testID={`entry-${e.id}`}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowTitle}>{label}</Text>
                    <Text style={s.rowSub}>{e.collection.name} · {e.collection.season}</Text>
                    {tab === 'repetido' && e.quantity > 1 ? <Text style={s.qty}>x{e.quantity}</Text> : null}
                  </View>
                  <TouchableOpacity testID={`del-${e.id}`} onPress={() => remove(e.id)} style={s.delBtn}>
                    <Ionicons name="trash" size={20} color="#f87171" />
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      <TouchableOpacity testID="fab-add" style={s.fab} onPress={() => { resetForm(); setModal(true); }}>
        <Ionicons name="add" size={28} color="#0b1220" />
      </TouchableOpacity>

      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <KeyboardAvoidingView style={s.modalBg} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.modal}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
              <View style={s.modalHead}>
                <Text style={s.modalTitle}>Añadir a {tab === 'busco' ? 'Busco' : 'Repetidos'}</Text>
                <TouchableOpacity onPress={() => setModal(false)}><Ionicons name="close" size={24} color="#94a3b8" /></TouchableOpacity>
              </View>

              {/* Collection selector */}
              {!newColMode ? (
                <>
                  <Text style={s.label}>Colección</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {collections.map((c) => (
                      <TouchableOpacity
                        key={c.id}
                        style={[s.chip, colId === c.id && s.chipActive]}
                        onPress={() => { setColId(c.id); if (c.total_cards) setRangeMax(c.total_cards); }}
                      >
                        <Text style={[s.chipTxt, colId === c.id && s.chipTxtActive]}>{c.name} · {c.season}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <TouchableOpacity onPress={() => setNewColMode(true)}>
                    <Text style={s.linkTxt}>+ Crear nueva colección</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={s.label}>Nueva colección · nombre</Text>
                  <TextInput style={s.input} value={newColName} onChangeText={setNewColName} placeholder="LaLiga Base" placeholderTextColor="#64748b" />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.label}>Temporada</Text>
                      <TextInput style={s.input} value={newColSeason} onChangeText={setNewColSeason} placeholder="2025-2026" placeholderTextColor="#64748b" />
                    </View>
                    <View style={{ width: 120 }}>
                      <Text style={s.label}>Total cromos</Text>
                      <TextInput style={s.input} value={newColTotal} onChangeText={setNewColTotal} keyboardType="numeric" placeholder="100" placeholderTextColor="#64748b" />
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => setNewColMode(false)}>
                    <Text style={s.linkTxt}>← Usar existente</Text>
                  </TouchableOpacity>
                </>
              )}

              {/* Mode selector */}
              <View style={s.modeRow}>
                <TouchableOpacity style={[s.modeBtn, mode === 'numeros' && s.modeBtnActive]} onPress={() => setMode('numeros')}>
                  <Text style={[s.modeTxt, mode === 'numeros' && s.modeTxtActive]}>🔢 Por número</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.modeBtn, mode === 'especial' && s.modeBtnActive]} onPress={() => setMode('especial')}>
                  <Text style={[s.modeTxt, mode === 'especial' && s.modeTxtActive]}>⭐ Especial (nombre)</Text>
                </TouchableOpacity>
              </View>

              {/* IA oculta temporalmente para demo
              <TouchableOpacity testID="ai-open" style={s.aiBtn} onPress={openAi}>
                <Ionicons name="sparkles" size={18} color="#fff" />
                <Text style={s.aiBtnTxt}>🤖 Importar con IA desde foto</Text>
              </TouchableOpacity>
              */}

              {mode === 'numeros' ? (
                <>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end', marginBottom: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.label}>Mostrar hasta nº</Text>
                      <TextInput
                        style={s.input}
                        value={String(rangeMax)}
                        onChangeText={(v) => {
                          const n = parseInt(v, 10);
                          if (!isNaN(n) && n > 0 && n <= 500) setRangeMax(n);
                          else if (v === '') setRangeMax(0);
                        }}
                        keyboardType="numeric"
                      />
                    </View>
                    <TouchableOpacity style={s.smallBtn} onPress={() => selectRange(1, Math.min(rangeMax || 0, 500))}>
                      <Text style={s.smallBtnTxt}>Todos</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.smallBtn} onPress={() => setSelectedNumbers(new Set())}>
                      <Text style={s.smallBtnTxt}>Limpiar</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={s.hint}>{selectedNumbers.size} seleccionados</Text>

                  <View style={s.grid}>
                    {Array.from({ length: rangeMax }, (_, i) => i + 1).map((n) => {
                      const on = selectedNumbers.has(n);
                      return (
                        <TouchableOpacity
                          key={n}
                          testID={`num-${n}`}
                          style={[s.numCell, on && s.numCellOn]}
                          onPress={() => toggleNumber(n)}
                        >
                          <Text style={[s.numCellTxt, on && s.numCellTxtOn]}>{n}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              ) : (
                <>
                  <Text style={s.label}>Nombre del jugador</Text>
                  <TextInput
                    testID="special-name"
                    style={s.input}
                    value={specialName}
                    onChangeText={setSpecialName}
                    placeholder="Ej: Lamine Yamal"
                    placeholderTextColor="#64748b"
                    onSubmitEditing={addSpecial}
                  />

                  <Text style={s.label}>Tipo</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity style={[s.chip, specialType === 'ballondor' && s.chipActive]} onPress={() => setSpecialType('ballondor')}>
                      <Text style={[s.chipTxt, specialType === 'ballondor' && s.chipTxtActive]}>🏆 Balón de Oro</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.chip, specialType === 'special' && s.chipActive]} onPress={() => setSpecialType('special')}>
                      <Text style={[s.chipTxt, specialType === 'special' && s.chipTxtActive]}>⭐ Especial</Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity testID="add-special" style={[s.btn, s.btnAddSpecial]} onPress={addSpecial}>
                    <Text style={s.btnAddSpecialTxt}>+ Añadir especial a la lista</Text>
                  </TouchableOpacity>

                  {specials.length > 0 ? (
                    <View style={{ marginTop: 8 }}>
                      <Text style={s.hint}>{specials.length} especiales en lista</Text>
                      {specials.map((sp, i) => (
                        <View key={`${sp.player_name}-${i}`} style={s.specRow}>
                          <Text style={s.specTxt}>
                            {sp.card_type === 'ballondor' ? '🏆' : '⭐'} {sp.player_name}
                          </Text>
                          <TouchableOpacity onPress={() => removeSpecial(i)}>
                            <Ionicons name="close-circle" size={20} color="#f87171" />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </>
              )}

              {/* Quantity only for repetido */}
              {tab === 'repetido' ? (
                <>
                  <Text style={s.label}>Cantidad por cromo</Text>
                  <TextInput style={s.input} value={qty} onChangeText={setQty} keyboardType="numeric" placeholder="1" placeholderTextColor="#64748b" />
                </>
              ) : null}

              {currentCol ? <Text style={s.colInfo}>Colección: {currentCol.name} · {currentCol.season}</Text> : null}

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
                <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={() => setModal(false)}>
                  <Text style={s.btnGhostTxt}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity testID="form-submit" style={[s.btn, s.btnPrimary]} onPress={submit} disabled={submitting}>
                  {submitting ? <ActivityIndicator color="#0b1220" /> : (
                    <Text style={s.btnPrimaryTxt}>
                      Guardar ({selectedNumbers.size + specials.length})
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL IA — oculto temporalmente para demo (la lógica/handlers permanecen sin tocar) */}
      {false ? (
      <Modal visible={aiModal} transparent animationType="slide" onRequestClose={() => setAiModal(false)}>
        <View style={s.modalBg}>
          <View style={s.modal}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={s.modalHead}>
                <Text style={s.modalTitle}>🤖 Asistente IA</Text>
                <TouchableOpacity onPress={() => setAiModal(false)}>
                  <Ionicons name="close" size={24} color="#94a3b8" />
                </TouchableOpacity>
              </View>

              <Text style={s.aiHint}>
                Haz una foto a una lista escrita a mano o a tus cromos repetidos.
                La IA extraerá los números y nombres y podrás revisarlos antes de guardarlos.
              </Text>

              <Text style={s.label}>¿Qué hay en la foto?</Text>
              <View style={s.modeRow}>
                <TouchableOpacity style={[s.modeBtn, aiSrcMode === 'lista' && s.modeBtnActive]} onPress={() => setAiSrcMode('lista')}>
                  <Text style={[s.modeTxt, aiSrcMode === 'lista' && s.modeTxtActive]}>📝 Lista escrita</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.modeBtn, aiSrcMode === 'cromos' && s.modeBtnActive]} onPress={() => setAiSrcMode('cromos')}>
                  <Text style={[s.modeTxt, aiSrcMode === 'cromos' && s.modeTxtActive]}>🃏 Foto cromos</Text>
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <TouchableOpacity testID="ai-pick-gallery" style={[s.btn, s.btnGhost, { flex: 1 }]} onPress={pickImage}>
                  <Text style={s.btnGhostTxt}>🖼️ Galería</Text>
                </TouchableOpacity>
                {Platform.OS !== 'web' ? (
                  <TouchableOpacity testID="ai-pick-camera" style={[s.btn, s.btnGhost, { flex: 1 }]} onPress={takePhoto}>
                    <Text style={s.btnGhostTxt}>📷 Cámara</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {aiPreview ? (
                <View style={{ marginTop: 12, alignItems: 'center' }}>
                  <Image source={{ uri: aiPreview }} style={s.aiPreview} resizeMode="contain" />
                  <TouchableOpacity testID="ai-analyze" style={[s.aiAnalyzeBtn, aiLoading && { opacity: 0.6 }]} onPress={analyze} disabled={aiLoading}>
                    {aiLoading ? <ActivityIndicator color="#0b1220" /> : (
                      <>
                        <Ionicons name="sparkles" size={18} color="#0b1220" />
                        <Text style={s.aiAnalyzeTxt}>Analizar con IA</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ) : null}

              {(aiNumbers.length > 0 || aiSpecials.length > 0) ? (
                <>
                  <Text style={[s.label, { color: '#22c55e', fontWeight: '700' }]}>
                    Resultados detectados — revisa, edita y confirma:
                  </Text>

                  {/* Números */}
                  <Text style={s.subLabel}>Números ({aiNumbers.length})</Text>
                  <View style={s.chipRow}>
                    {aiNumbers.map((n) => (
                      <TouchableOpacity key={n} style={s.chipNum} onPress={() => aiRemoveNumber(n)}>
                        <Text style={s.chipNumTxt}>{n}</Text>
                        <Ionicons name="close-circle" size={14} color="#0b1220" style={{ marginLeft: 4 }} />
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                    <TextInput
                      style={[s.input, { flex: 1 }]} value={aiNewNum} onChangeText={setAiNewNum}
                      keyboardType="numeric" placeholder="Añadir número" placeholderTextColor="#64748b"
                      onSubmitEditing={aiAddNumber}
                    />
                    <TouchableOpacity style={s.smallBtn} onPress={aiAddNumber}>
                      <Text style={s.smallBtnTxt}>+</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Especiales */}
                  <Text style={s.subLabel}>Especiales ({aiSpecials.length})</Text>
                  {aiSpecials.map((sp, i) => (
                    <View key={`${sp.player_name}-${i}`} style={s.specRow}>
                      <Text style={s.specTxt}>
                        {sp.card_type === 'ballondor' ? '🏆' : '⭐'} {sp.player_name}
                      </Text>
                      <TouchableOpacity onPress={() => aiRemoveSpecial(i)}>
                        <Ionicons name="close-circle" size={20} color="#f87171" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  <TextInput
                    style={s.input} value={aiNewName} onChangeText={setAiNewName}
                    placeholder="Añadir jugador especial" placeholderTextColor="#64748b"
                  />
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                    <TouchableOpacity style={[s.smallBtn, { flex: 1 }]} onPress={() => aiAddSpecial('special')}>
                      <Text style={s.smallBtnTxt}>+ ⭐ Especial</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.smallBtn, { flex: 1 }]} onPress={() => aiAddSpecial('ballondor')}>
                      <Text style={s.smallBtnTxt}>+ 🏆 Balón</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
                    <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={() => setAiModal(false)}>
                      <Text style={s.btnGhostTxt}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity testID="ai-confirm" style={[s.btn, s.btnPrimary]} onPress={confirmAi}>
                      <Text style={s.btnPrimaryTxt}>✓ Confirmar e importar ({aiNumbers.length + aiSpecials.length})</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0b1220' },
  tabs: { flexDirection: 'row', padding: 12, gap: 8 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#111c2e', alignItems: 'center', borderWidth: 1, borderColor: '#1f2a44' },
  tabActive: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  tabTxt: { color: '#cbd5e1', fontWeight: '600' },
  tabTxtActive: { color: '#0b1220' },
  search: { backgroundColor: '#111c2e', borderColor: '#1f2a44', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#fff', fontSize: 14 },
  empty: { color: '#94a3b8', textAlign: 'center', marginTop: 40 },
  row: { flexDirection: 'row', backgroundColor: '#111c2e', padding: 14, borderRadius: 10, marginBottom: 8, alignItems: 'center', borderWidth: 1, borderColor: '#1f2a44' },
  rowTitle: { color: '#fff', fontWeight: '600', fontSize: 15 },
  rowSub: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  qty: { color: '#22c55e', fontWeight: '700', fontSize: 12, marginTop: 2 },
  delBtn: { padding: 8 },
  fab: { position: 'absolute', right: 20, bottom: 20, backgroundColor: '#22c55e', width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', elevation: 6 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#0f1a2e', paddingHorizontal: 20, paddingTop: 20, paddingBottom: Platform.OS === 'android' ? 36 : 24, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92%' },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },
  label: { color: '#cbd5e1', fontSize: 13, marginTop: 12, marginBottom: 6 },
  input: { backgroundColor: '#111c2e', borderColor: '#1f2a44', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#fff', fontSize: 15 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#111c2e', borderWidth: 1, borderColor: '#1f2a44', marginRight: 6 },
  chipActive: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  chipTxt: { color: '#cbd5e1', fontSize: 13 },
  chipTxtActive: { color: '#0b1220', fontWeight: '700' },
  linkTxt: { color: '#22c55e', fontWeight: '600', marginTop: 4, fontSize: 13 },
  modeRow: { flexDirection: 'row', gap: 8, marginTop: 16, marginBottom: 4 },
  modeBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#111c2e', borderWidth: 1, borderColor: '#1f2a44', alignItems: 'center' },
  modeBtnActive: { backgroundColor: '#0f2a1f', borderColor: '#22c55e' },
  modeTxt: { color: '#cbd5e1', fontWeight: '600' },
  modeTxtActive: { color: '#22c55e' },
  smallBtn: { backgroundColor: '#111c2e', borderColor: '#1f2a44', borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 },
  smallBtnTxt: { color: '#cbd5e1', fontWeight: '600', fontSize: 12 },
  hint: { color: '#22c55e', fontSize: 12, marginVertical: 6, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  numCell: {
    width: 44, height: 44, borderRadius: 8, backgroundColor: '#111c2e',
    borderWidth: 1, borderColor: '#1f2a44', justifyContent: 'center', alignItems: 'center',
  },
  numCellOn: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  numCellTxt: { color: '#cbd5e1', fontSize: 13, fontWeight: '600' },
  numCellTxtOn: { color: '#0b1220', fontWeight: '800' },
  specRow: { flexDirection: 'row', backgroundColor: '#111c2e', padding: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'space-between', marginTop: 6, borderWidth: 1, borderColor: '#1f2a44' },
  specTxt: { color: '#fff', fontSize: 14 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  btnPrimary: { backgroundColor: '#22c55e' },
  btnPrimaryTxt: { color: '#0b1220', fontWeight: '700' },
  btnGhost: { borderWidth: 1, borderColor: '#334155' },
  btnGhostTxt: { color: '#fff', fontWeight: '600' },
  btnAddSpecial: { backgroundColor: '#1e3a5f', marginTop: 10, flex: 0, paddingHorizontal: 16, alignSelf: 'flex-start' },
  btnAddSpecialTxt: { color: '#60a5fa', fontWeight: '600', fontSize: 13 },
  colInfo: { color: '#64748b', fontSize: 12, marginTop: 10, textAlign: 'center' },
  // AI styles
  aiBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#7c3aed', paddingVertical: 12, borderRadius: 10, marginTop: 12 },
  aiBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  aiHint: { color: '#94a3b8', fontSize: 13, lineHeight: 19, marginTop: 4, marginBottom: 8 },
  aiPreview: { width: '100%', height: 200, borderRadius: 10, backgroundColor: '#000', marginVertical: 10 },
  aiAnalyzeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#22c55e', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10, marginTop: 4 },
  aiAnalyzeTxt: { color: '#0b1220', fontWeight: '700' },
  subLabel: { color: '#cbd5e1', fontSize: 13, marginTop: 12, marginBottom: 4, fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chipNum: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#22c55e', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  chipNumTxt: { color: '#0b1220', fontWeight: '700' },
});

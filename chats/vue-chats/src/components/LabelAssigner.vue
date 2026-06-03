<script setup>
import { ref, watch } from 'vue'
import { useChatStore } from '@/stores/chatStore'
import { getApiBase } from '@/utils/apiBase'
import { fetchLabelsList } from '@/composables/useCatalog'

const store = useChatStore()

const MAX_ETIQUETAS = 4
const COLORES = [
	'#588044',
	'#d97706',
	'#dc2626',
	'#2563eb',
	'#7c3aed',
	'#db2777',
	'#0f766e',
	'#ea580c',
	'#475569',
	'#65a30d',
	'#0891b2',
	'#b91c1c',
]

const etiquetasSeleccionadas = ref([])
const colorSeleccionado = ref(COLORES[0])
const nuevaEtiquetaNombre = ref('')
const cargando = ref(false)
const eliminandoEtiquetaId = ref(null)
const errorMsg = ref('')

async function cargarCatalogoEtiquetas() {
	const lista = await fetchLabelsList()
	store.setEtiquetas(lista)
}

async function cargarEtiquetasDeConversacion(conversacionId) {
	const convId = String(conversacionId || '').trim()
	if (!convId) return []
	const res = await fetch(`${getApiBase()}/api/conversations/${encodeURIComponent(convId)}/labels`)
	if (!res.ok) throw new Error(`No se pudo cargar etiquetas por conversacion (HTTP ${res.status})`)
	const data = await res.json()
	return Array.isArray(data) ? data : []
}

watch(() => store.labelModalOpen, (open) => {
if (!open) return
errorMsg.value = ''
nuevaEtiquetaNombre.value = ''
colorSeleccionado.value = COLORES[0]
etiquetasSeleccionadas.value = []
cargando.value = true

const convId = store.labelModalConvId
Promise.all([cargarCatalogoEtiquetas(), cargarEtiquetasDeConversacion(convId)])
	.then(([, etiquetasConv]) => {
		etiquetasSeleccionadas.value = etiquetasConv
			.map((item) => store.etiquetas.find((e) => String(e.nombre || '').toLowerCase() === String(item.nombre || item.etiqueta || '').toLowerCase()))
			.filter(Boolean)
			.map((e) => ({ id: e.id, nombre: e.nombre, color: e.color }))
	})
	.catch((error) => {
		console.error('Error cargando etiquetas:', error)
		errorMsg.value = 'No se pudieron cargar las etiquetas'
	})
	.finally(() => {
		cargando.value = false
	})
})

function parsearEtiquetasPorConv(lista) {
const resultado = []
lista.forEach(item => {
const nombres = (item.etiqueta || '').replace(/^\|+|\|+$/g, '').split('|').map(s => s.trim()).filter(Boolean)
const colores = (item.color || '').replace(/^\|+|\|+$/g, '').split('|').map(s => s.trim()).filter(Boolean)
nombres.forEach((nombre, i) => {
resultado.push({ etiqueta: nombre, color: colores[i] || '#7eb83b' })
})
})
return resultado
}

const estaSeleccionada = (etiqueta) =>
etiquetasSeleccionadas.value.some(e => e.id === etiqueta.id)

const toggleEtiqueta = (etiqueta) => {
const idx = etiquetasSeleccionadas.value.findIndex(e => e.id === etiqueta.id)
if (idx >= 0) {
etiquetasSeleccionadas.value.splice(idx, 1)
} else {
if (etiquetasSeleccionadas.value.length >= MAX_ETIQUETAS) {
errorMsg.value = `Maximo ${MAX_ETIQUETAS} etiquetas por conversacion`
return
}
etiquetasSeleccionadas.value.push({ id: etiqueta.id, nombre: etiqueta.nombre, color: etiqueta.color })
}
errorMsg.value = ''
}

const quitarSeleccionada = (etiquetaId) => {
const idx = etiquetasSeleccionadas.value.findIndex(e => e.id === etiquetaId)
if (idx >= 0) etiquetasSeleccionadas.value.splice(idx, 1)
}

const crearEtiqueta = () => {
const nombre = nuevaEtiquetaNombre.value.trim()
if (!nombre || !colorSeleccionado.value) return

fetch(`${getApiBase()}/api/conversations/labels`, {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ nombre, color: colorSeleccionado.value }),
})
	.then(async (res) => {
		const data = await res.json().catch(() => ({}))
		if (!res.ok) throw new Error(data?.error || 'Error al crear etiqueta')
		await cargarCatalogoEtiquetas()
		const creada = store.etiquetas.find(
			(e) => String(e.nombre || '').toLowerCase() === nombre.toLowerCase(),
		)
		if (creada && !estaSeleccionada(creada)) {
			toggleEtiqueta(creada)
		}
		nuevaEtiquetaNombre.value = ''
		colorSeleccionado.value = COLORES[0]
		errorMsg.value = ''
	})
	.catch((error) => {
		errorMsg.value = error?.message || 'Error al crear etiqueta'
	})
}

const eliminarEtiqueta = (etiqueta) => {
	if (!etiqueta?.id) return
	if (!window.confirm(`Eliminar etiqueta "${etiqueta.nombre}"?`)) return

	eliminandoEtiquetaId.value = etiqueta.id
	fetch(`${getApiBase()}/api/conversations/labels/${encodeURIComponent(etiqueta.id)}`, {
		method: 'DELETE',
	})
		.then(async (res) => {
			const data = await res.json().catch(() => ({}))
			if (!res.ok) throw new Error(data?.error || 'No se pudo eliminar etiqueta')

			etiquetasSeleccionadas.value = etiquetasSeleccionadas.value.filter(
				(e) => String(e.id) !== String(etiqueta.id),
			)
			store.removeEtiquetaCatalogo(etiqueta.id)
			errorMsg.value = ''
		})
		.catch((error) => {
			errorMsg.value = error?.message || 'No se pudo eliminar etiqueta'
		})
		.finally(() => {
			eliminandoEtiquetaId.value = null
		})
}

const guardar = () => {
	const convId = String(store.labelModalConvId || '').trim()
	if (!convId) {
		errorMsg.value = 'No hay conversacion seleccionada'
		return
	}

	fetch(`${getApiBase()}/api/conversations/${encodeURIComponent(convId)}/labels`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ etiquetas: etiquetasSeleccionadas.value }),
	})
		.then(async (res) => {
			const data = await res.json().catch(() => ({}))
			if (!res.ok) throw new Error(data?.error || 'No se pudieron guardar etiquetas')
			const etiquetasGuardadas = Array.isArray(data.etiquetas)
				? data.etiquetas
				: etiquetasSeleccionadas.value
			store.asignarEtiquetasAConv(
				store.labelModalConvId,
				store.labelModalTelefono,
				etiquetasGuardadas,
			)
			store.cerrarModalEtiquetas()
		})
		.catch((error) => {
			errorMsg.value = error?.message || 'No se pudieron guardar etiquetas'
		})
}

const cerrar = () => store.cerrarModalEtiquetas()
</script>

<template>
<Teleport to="body">
<div v-if="store.labelModalOpen" class="modal-overlay" @click.self="cerrar">
<div class="modal-box">
<div class="modal-header">
<span class="modal-title">Etiquetar conversacion</span>
<button type="button" class="btn-close" @click="cerrar">x</button>
</div>

<div class="modal-body">
<div v-if="etiquetasSeleccionadas.length > 0" class="chips-row">
<span
v-for="e in etiquetasSeleccionadas"
:key="e.id"
class="chip"
:style="{ backgroundColor: e.color }"
>
{{ e.nombre }}
<button type="button" class="chip-remove" @click="quitarSeleccionada(e.id)">x</button>
</span>
</div>

<div v-if="cargando" class="loading-msg">Cargando etiquetas...</div>

<div v-else class="etiqueta-list">
<label
v-for="etiqueta in store.etiquetas"
:key="etiqueta.id"
class="etiqueta-row"
:class="{ selected: estaSeleccionada(etiqueta) }"
>
<div class="etiqueta-row-main">
<input
type="checkbox"
:checked="estaSeleccionada(etiqueta)"
@change="toggleEtiqueta(etiqueta)"
/>
<span class="color-dot" :style="{ backgroundColor: etiqueta.color }"></span>
<span class="etiqueta-nombre">{{ etiqueta.nombre }}</span>
</div>
<button
type="button"
class="btn-eliminar-etiqueta"
:disabled="eliminandoEtiquetaId === etiqueta.id"
@click.stop="eliminarEtiqueta(etiqueta)"
>
{{ eliminandoEtiquetaId === etiqueta.id ? '...' : 'Eliminar' }}
</button>
</label>
</div>

<p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>

<div class="nueva-etiqueta-section">
<div class="color-selector">
<button
v-for="color in COLORES"
:key="color"
type="button"
class="color-btn"
:class="{ active: colorSeleccionado === color }"
:style="{ backgroundColor: color }"
@click="colorSeleccionado = color"
></button>
</div>
<div class="nueva-etiqueta-row">
<input
v-model="nuevaEtiquetaNombre"
type="text"
class="input-nueva"
placeholder="Nueva etiqueta..."
maxlength="40"
@keyup.enter="crearEtiqueta"
/>
<button type="button" class="btn-agregar" @click="crearEtiqueta">Crear</button>
</div>
</div>
</div>

<div class="modal-footer">
<button type="button" class="btn-cancelar" @click="cerrar">Cancelar</button>
<button type="button" class="btn-guardar" @click="guardar">Guardar</button>
</div>
</div>
</div>
</Teleport>
</template>

<style scoped>
.modal-overlay {
position: fixed;
inset: 0;
background: rgba(0, 0, 0, 0.45);
display: flex;
align-items: center;
justify-content: center;
z-index: 1000;
}
.modal-box {
background: #fff;
border-radius: 12px;
width: 440px;
max-width: 95vw;
max-height: 85vh;
display: flex;
flex-direction: column;
box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
}
.modal-header {
display: flex;
align-items: center;
justify-content: space-between;
padding: 14px 16px;
border-bottom: 1px solid var(--color-primary-soft);
}
.modal-title {
font-size: 15px;
font-weight: 700;
color: #334627;
}
.btn-close {
background: none;
border: none;
cursor: pointer;
font-size: 16px;
color: #6b7b5d;
padding: 4px;
}
.modal-body {
padding: 12px 16px;
overflow-y: auto;
flex: 1;
}
.chips-row {
display: flex;
flex-wrap: wrap;
gap: 6px;
margin-bottom: 12px;
}
.chip {
display: inline-flex;
align-items: center;
gap: 4px;
padding: 3px 8px;
border-radius: 12px;
color: #fff;
font-size: 12px;
font-weight: 500;
}
.chip-remove {
background: none;
border: none;
color: rgba(255, 255, 255, 0.8);
cursor: pointer;
font-size: 11px;
padding: 0;
line-height: 1;
}
.loading-msg {
color: #6b7b5d;
font-size: 13px;
padding: 8px 0;
}
.etiqueta-list {
display: flex;
flex-direction: column;
gap: 4px;
margin-bottom: 12px;
}
.etiqueta-row {
display: flex;
align-items: center;
justify-content: space-between;
padding: 6px 8px;
border-radius: 6px;
cursor: pointer;
user-select: none;
}
.etiqueta-row-main {
display: flex;
align-items: center;
gap: 8px;
min-width: 0;
}
.etiqueta-row:hover { background: #edf4e4; }
.etiqueta-row.selected { background: var(--color-primary-soft); }
.color-dot {
width: 12px;
height: 12px;
border-radius: 50%;
flex-shrink: 0;
}
.etiqueta-nombre {
font-size: 13px;
color: #334627;
}
.btn-eliminar-etiqueta {
border: 1px solid #e3c9c9;
background: #fff;
color: #a04242;
font-size: 11px;
border-radius: 6px;
padding: 3px 8px;
cursor: pointer;
}
.btn-eliminar-etiqueta:disabled {
opacity: 0.6;
cursor: default;
}
.error-msg {
font-size: 12px;
color: #588044;
margin: 4px 0 8px;
}
.nueva-etiqueta-section {
border-top: 1px solid var(--color-primary-soft);
padding-top: 10px;
margin-top: 4px;
}
.color-selector {
display: flex;
flex-wrap: wrap;
justify-content: center;
align-items: center;
gap: 10px;
margin-bottom: 12px;
padding: 10px;
border: 1px solid #d9e6cd;
border-radius: 10px;
background: #f7fbf1;
}
.color-btn {
width: 42px;
height: 42px;
border-radius: 999px;
border: 3px solid transparent;
cursor: pointer;
padding: 0;
box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.75);
transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
flex: 0 0 42px;
}
.color-btn:hover {
transform: translateY(-1px);
box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.85), 0 4px 10px rgba(0, 0, 0, 0.12);
}
.color-btn.active {
border-color: #334627;
outline: 3px solid rgba(88, 128, 68, 0.2);
transform: translateY(-1px);
}
.nueva-etiqueta-row {
display: flex;
gap: 8px;
}
.input-nueva {
flex: 1;
padding: 6px 10px;
border: 1px solid var(--color-primary-soft);
border-radius: 6px;
font-size: 13px;
outline: none;
}
.input-nueva:focus { border-color: var(--color-primary); }
.btn-agregar {
padding: 6px 12px;
background: #edf4e4;
color: var(--color-primary);
border: 1px solid #c5dab9;
border-radius: 6px;
font-size: 13px;
cursor: pointer;
white-space: nowrap;
}
.modal-footer {
display: flex;
justify-content: flex-end;
gap: 8px;
padding: 12px 16px;
border-top: 1px solid var(--color-primary-soft);
}
.btn-cancelar {
padding: 8px 16px;
background: none;
border: 1px solid var(--color-primary-soft);
border-radius: 6px;
font-size: 13px;
color: #566b4d;
cursor: pointer;
}
.btn-guardar {
padding: 8px 18px;
background: var(--color-primary);
color: #fff;
border: none;
border-radius: 6px;
font-size: 13px;
font-weight: 600;
cursor: pointer;
}
.btn-guardar:hover { background: #4d703c; }

@media (max-width: 520px) {
.modal-box {
width: min(96vw, 420px);
}

.color-selector {
gap: 8px;
}

.nueva-etiqueta-row {
flex-direction: column;
}
}
</style>



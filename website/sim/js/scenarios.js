/**
 * scenarios.js — Gestor de escenarios de simulación
 * Carga/guarda escenarios en localStorage, exporta/importa JSON.
 */

const SCENARIO_STORAGE = 'fisicahn_scenarios';

export class ScenarioManager {
  constructor(callbacks = {}) {
    this.scenarios = [];
    this.onLoad = callbacks.onLoad || (() => {});
    this.onSave = callbacks.onSave || (() => {});
    this.onList = callbacks.onList || (() => {});

    this.buildUI();
  }

  buildUI() {
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'scenario-manager';

    const title = document.createElement('h4');
    title.className = 'scenario-title';
    title.textContent = 'Escenarios';
    this.wrapper.appendChild(title);

    const btnRow = document.createElement('div');
    btnRow.className = 'scenario-btn-row';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'scenario-btn';
    saveBtn.textContent = '💾 Guardar';
    saveBtn.addEventListener('click', () => this.promptSave());
    btnRow.appendChild(saveBtn);

    const loadBtn = document.createElement('button');
    loadBtn.className = 'scenario-btn';
    loadBtn.textContent = '📂 Cargar';
    loadBtn.addEventListener('click', () => this.showList());
    btnRow.appendChild(loadBtn);

    const exportBtn = document.createElement('button');
    exportBtn.className = 'scenario-btn';
    exportBtn.textContent = '📤 Exportar';
    exportBtn.addEventListener('click', () => this.exportJSON());
    btnRow.appendChild(exportBtn);

    const importBtn = document.createElement('button');
    importBtn.className = 'scenario-btn';
    importBtn.textContent = '📥 Importar';
    importBtn.addEventListener('click', () => this.triggerImport());
    btnRow.appendChild(importBtn);

    this.wrapper.appendChild(btnRow);

    // Import input oculto
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = '.json';
    this.fileInput.style.display = 'none';
    this.fileInput.addEventListener('change', (e) => this.importJSON(e));
    this.wrapper.appendChild(this.fileInput);

    this.listEl = document.createElement('div');
    this.listEl.className = 'scenario-list';
    this.wrapper.appendChild(this.listEl);

    // Save dialog
    this.saveDialog = document.createElement('div');
    this.saveDialog.className = 'scenario-dialog';
    this.saveDialog.innerHTML = `
      <div class="scenario-dialog-content">
        <h5>Guardar escenario</h5>
        <input type="text" class="scenario-save-name" placeholder="Nombre del escenario" />
        <textarea class="scenario-save-desc" placeholder="Descripción (opcional)"></textarea>
        <div class="scenario-dialog-btns">
          <button class="scenario-btn scenario-btn-confirm">Guardar</button>
          <button class="scenario-btn scenario-btn-cancel">Cancelar</button>
        </div>
      </div>
    `;
    this.saveDialog.style.display = 'none';
    this.wrapper.appendChild(this.saveDialog);
  }

  save(name, module, controls, description) {
    const scenario = {
      name: name || 'Sin nombre',
      module: module || 'unknown',
      controls: controls || {},
      description: description || '',
      timestamp: new Date().toISOString()
    };

    let list = this.getAll();
    const idx = list.findIndex(s => s.name === scenario.name);
    if (idx >= 0) list[idx] = scenario;
    else list.push(scenario);
    localStorage.setItem(SCENARIO_STORAGE, JSON.stringify(list));
    this.scenarios = list;
    this.onSave(scenario);
    return scenario;
  }

  load(name) {
    const list = this.getAll();
    const scenario = list.find(s => s.name === name);
    if (!scenario) return null;
    this.onLoad(scenario);
    return scenario;
  }

  remove(name) {
    let list = this.getAll();
    list = list.filter(s => s.name !== name);
    localStorage.setItem(SCENARIO_STORAGE, JSON.stringify(list));
    this.scenarios = list;
    this.showList();
  }

  list() {
    return this.getAll();
  }

  getAll() {
    try {
      const raw = localStorage.getItem(SCENARIO_STORAGE);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  exportJSON(name) {
    let data;
    if (name) {
      data = this.load(name);
      if (!data) return;
    } else {
      const all = this.getAll();
      data = all.length === 1 ? all[0] : all;
    }
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name || 'escenario'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  triggerImport() {
    this.fileInput.click();
  }

  importJSON(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (Array.isArray(data)) {
          data.forEach(s => this.save(s.name, s.module, s.controls, s.description));
        } else {
          this.save(data.name, data.module, data.controls, data.description);
        }
        this.showList();
      } catch (err) {
        console.error('Error al importar escenario:', err);
        alert('Error al importar: formato JSON inválido.');
      }
    };
    reader.readAsText(file);
  }

  promptSave() {
    this.saveDialog.style.display = 'block';
    const nameInput = this.saveDialog.querySelector('.scenario-save-name');
    const descInput = this.saveDialog.querySelector('.scenario-save-desc');
    nameInput.value = '';
    descInput.value = '';
    nameInput.focus();

    const confirm = this.saveDialog.querySelector('.scenario-btn-confirm');
    const cancel = this.saveDialog.querySelector('.scenario-btn-cancel');

    const onConfirm = () => {
      this.save(nameInput.value, undefined, undefined, descInput.value);
      this.saveDialog.style.display = 'none';
      this.showList();
      cleanup();
    };
    const onCancel = () => {
      this.saveDialog.style.display = 'none';
      cleanup();
    };
    const onKey = (e) => {
      if (e.key === 'Enter') onConfirm();
      if (e.key === 'Escape') onCancel();
    };
    const cleanup = () => {
      confirm.removeEventListener('click', onConfirm);
      cancel.removeEventListener('click', onCancel);
      document.removeEventListener('keydown', onKey);
    };
    confirm.addEventListener('click', onConfirm);
    cancel.addEventListener('click', onCancel);
    document.addEventListener('keydown', onKey);
  }

  showList() {
    const list = this.getAll();
    this.listEl.innerHTML = '';

    if (list.length === 0) {
      this.listEl.innerHTML = '<p class="scenario-empty">No hay escenarios guardados.</p>';
      return;
    }

    list.forEach(s => {
      const item = document.createElement('div');
      item.className = 'scenario-item';

      const info = document.createElement('div');
      info.className = 'scenario-item-info';

      const name = document.createElement('div');
      name.className = 'scenario-item-name';
      name.textContent = s.name;
      info.appendChild(name);

      if (s.description) {
        const desc = document.createElement('div');
        desc.className = 'scenario-item-desc';
        desc.textContent = s.description;
        info.appendChild(desc);
      }

      const meta = document.createElement('div');
      meta.className = 'scenario-item-meta';
      meta.textContent = `Módulo: ${s.module || '—'}  |  ${s.timestamp ? new Date(s.timestamp).toLocaleDateString() : ''}`;
      info.appendChild(meta);

      item.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'scenario-item-actions';

      const loadBtn = document.createElement('button');
      loadBtn.className = 'scenario-btn scenario-btn-sm';
      loadBtn.textContent = 'Cargar';
      loadBtn.addEventListener('click', () => this.load(s.name));
      actions.appendChild(loadBtn);

      const exportBtn = document.createElement('button');
      exportBtn.className = 'scenario-btn scenario-btn-sm';
      exportBtn.textContent = 'Exportar';
      exportBtn.addEventListener('click', () => this.exportJSON(s.name));
      actions.appendChild(exportBtn);

      const delBtn = document.createElement('button');
      delBtn.className = 'scenario-btn scenario-btn-sm scenario-btn-danger';
      delBtn.textContent = 'Eliminar';
      delBtn.addEventListener('click', () => {
        if (confirm(`¿Eliminar "${s.name}"?`)) this.remove(s.name);
      });
      actions.appendChild(delBtn);

      item.appendChild(actions);
      this.listEl.appendChild(item);
    });
  }

  destroy() {
    this.wrapper.remove();
  }
}

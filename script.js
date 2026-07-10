/* ==========================================================================
   KEEPER — script.js
   Vanilla JavaScript note-taking app (Google Keep clone)
   Sections: State, DOM refs, Storage, Utilities, Validation, CRUD,
             Rendering, Icons, Modal, Card Popovers, Confirm Dialog,
             Search, Navigation, Header actions, Event wiring, Init
   ========================================================================== */

(function () {
  'use strict';

  /* ------------------------------------------------------------------
     1. STATE
     ------------------------------------------------------------------ */

  /** @type {Array<{id:string,title:string,content:string,archived:boolean,pinned:boolean,createdAt:number,color:string}>} */
  let notes = [];

  // Tracks which note is being edited in the modal ('' means creating new)
  let editingNoteId = '';

  // Currently selected color while the modal is open
  let selectedColor = 'note-default';

  // Id of the note pending deletion (used by the confirm dialog)
  let pendingDeleteId = '';

  // Current search query (lowercased)
  let searchQuery = '';

  // The note a floating card popover (color / kebab menu) currently targets
  let activePopoverNoteId = '';

  // Visually "selected" notes (round checkbox in the top-left of a card).
  // This is a lightweight UI affordance, not persisted, matching the
  // reference screenshot; it does not gate any destructive action.
  const selectedNoteIds = new Set();

  const STORAGE_KEY = 'keeper_notes_v1';

  // Available note background colors: [key, human label]
  const NOTE_COLORS = [
    ['note-default', 'Default'],
    ['note-coral', 'Coral'],
    ['note-peach', 'Peach'],
    ['note-sand', 'Sand'],
    ['note-mint', 'Mint'],
    ['note-fog', 'Fog'],
    ['note-storm', 'Storm'],
    ['note-dusk', 'Dusk'],
    ['note-blossom', 'Blossom'],
    ['note-clay', 'Clay'],
    ['note-graphite', 'Graphite']
  ];


  /* ------------------------------------------------------------------
     2. DOM REFERENCES
     ------------------------------------------------------------------ */

  const appHeader = document.getElementById('appHeader');
  const sidebar = document.getElementById('sidebar');

  const notesContainer = document.getElementById('notesContainer');
  const archiveGrid = document.getElementById('archiveGrid');
  const emptyNotes = document.getElementById('emptyNotes');
  const emptyArchive = document.getElementById('emptyArchive');
  const emptySearch = document.getElementById('emptySearch');

  const notesSection = document.getElementById('notes-section');
  const archiveSection = document.getElementById('archive-section');

  const quickAddBar = document.getElementById('quickAddBar');

  const modalOverlay = document.getElementById('modalOverlay');
  const noteModal = document.getElementById('noteModal');
  const noteForm = document.getElementById('noteForm');
  const noteTitleInput = document.getElementById('noteTitleInput');
  const noteContentInput = document.getElementById('noteContentInput');
  const formError = document.getElementById('formError');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const modalPinBtn = document.getElementById('modalPinBtn');
  const modalArchiveBtn = document.getElementById('modalArchiveBtn');

  const colorSwatchBtn = document.getElementById('colorSwatchBtn');
  const colorPalette = document.getElementById('colorPalette');
  const modalMenuBtn = document.getElementById('modalMenuBtn');
  const modalMenuPopover = document.getElementById('modalMenuPopover');
  const modalDuplicateItem = document.getElementById('modalDuplicateItem');
  const modalDeleteItem = document.getElementById('modalDeleteItem');

  const cardColorPopover = document.getElementById('cardColorPopover');
  const cardMenuPopover = document.getElementById('cardMenuPopover');
  const cardDuplicateItem = document.getElementById('cardDuplicateItem');
  const cardDeleteItem = document.getElementById('cardDeleteItem');

  const confirmOverlay = document.getElementById('confirmOverlay');
  const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
  const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');

  const toast = document.getElementById('toast');

  const sidebarItems = document.querySelectorAll('.sidebar-item');

  const refreshBtn = document.getElementById('refreshBtn');
  const viewToggleBtn = document.getElementById('viewToggleBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const appsBtn = document.getElementById('appsBtn');
  const avatarBtn = document.getElementById('avatarBtn');


  /* ------------------------------------------------------------------
     3. STORAGE (localStorage persistence — bonus feature)
     ------------------------------------------------------------------ */

  function saveNotesToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    } catch (err) {
      console.error('Failed to save notes:', err);
    }
  }

  function loadNotesFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      notes = raw ? JSON.parse(raw) : [];
      // Backfill the "pinned" field for notes saved before this feature existed
      notes.forEach((n) => { if (typeof n.pinned !== 'boolean') n.pinned = false; });
    } catch (err) {
      console.error('Failed to load notes:', err);
      notes = [];
    }
  }


  /* ------------------------------------------------------------------
     4. UTILITIES
     ------------------------------------------------------------------ */

  // Generates a reasonably unique id without external libraries
  function generateId() {
    return 'n_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  // Formats a timestamp into a short, human-friendly date
  function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // Escapes text before inserting into innerHTML to avoid HTML injection
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Shows a short-lived toast message at the bottom of the screen
  function showToast(message) {
    toast.textContent = message;
    toast.classList.remove('hidden');
    // Force reflow so the CSS transition re-triggers on rapid calls
    void toast.offsetWidth;
    toast.classList.add('show');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2200);
  }

  // Used for chrome that is present visually (to match Google Keep) but
  // is outside the scope of this clone's functionality
  function notImplemented(label) {
    showToast(`${label} isn't available in this demo`);
  }


  /* ------------------------------------------------------------------
     5. VALIDATION
     ------------------------------------------------------------------ */

  // A note is valid if it has a non-empty title OR non-empty content
  function validateForm(title, content) {
    return title.trim().length > 0 || content.trim().length > 0;
  }


  /* ------------------------------------------------------------------
     6. CRUD OPERATIONS
     ------------------------------------------------------------------ */

  // Creates a new note object and adds it to the notes array
  function createNote(title, content, color, pinned) {
    const newNote = {
      id: generateId(),
      title: title.trim(),
      content: content.trim(),
      archived: false,
      pinned: !!pinned,
      createdAt: Date.now(),
      color: color || 'note-default'
    };
    notes.unshift(newNote); // newest first
    saveNotesToStorage();
    renderNotes();
    showToast('Note added');
  }

  // Updates an existing note's fields
  function updateNote(id, title, content, color, pinned) {
    const note = notes.find((n) => n.id === id);
    if (!note) return;
    note.title = title.trim();
    note.content = content.trim();
    note.color = color;
    if (typeof pinned === 'boolean') note.pinned = pinned;
    saveNotesToStorage();
    renderNotes();
  }

  // Moves a note between active <-> archived states.
  // Archiving a note also unpins it, matching Google Keep's behavior.
  function archiveNote(id) {
    const note = notes.find((n) => n.id === id);
    if (!note) return;
    note.archived = !note.archived;
    if (note.archived) note.pinned = false;
    saveNotesToStorage();
    renderNotes();
    showToast(note.archived ? 'Note archived' : 'Note unarchived');
  }

  // Toggles the pinned state of a note
  function togglePin(id) {
    const note = notes.find((n) => n.id === id);
    if (!note || note.archived) return;
    note.pinned = !note.pinned;
    saveNotesToStorage();
    renderNotes();
  }

  // Creates a copy of an existing note directly below the original
  function duplicateNote(id) {
    const note = notes.find((n) => n.id === id);
    if (!note) return;
    const copy = {
      id: generateId(),
      title: note.title,
      content: note.content,
      archived: note.archived,
      pinned: false,
      createdAt: Date.now(),
      color: note.color
    };
    const index = notes.findIndex((n) => n.id === id);
    notes.splice(index + 1, 0, copy);
    saveNotesToStorage();
    renderNotes();
    showToast('Note copied');
  }

  // Removes a note permanently (called after confirm dialog)
  function deleteNote(id) {
    const cardEl = document.querySelector(`[data-note-id="${id}"]`);
    // Animate the card out before mutating state, for a smoother feel
    if (cardEl) {
      cardEl.classList.add('removing');
      setTimeout(() => {
        notes = notes.filter((n) => n.id !== id);
        selectedNoteIds.delete(id);
        saveNotesToStorage();
        renderNotes();
        showToast('Note deleted');
      }, 170);
    } else {
      notes = notes.filter((n) => n.id !== id);
      selectedNoteIds.delete(id);
      saveNotesToStorage();
      renderNotes();
    }
  }


  /* ------------------------------------------------------------------
     7. RENDERING
     ------------------------------------------------------------------ */

  // Builds the DOM markup for a single note card
  function buildNoteCard(note) {
    const article = document.createElement('article');
    article.className = 'note-card';
    if (note.pinned) article.classList.add('pinned');
    if (selectedNoteIds.has(note.id)) article.classList.add('selected');
    article.dataset.noteId = note.id;
    article.style.background = `var(--${note.color})`;
    article.setAttribute('role', 'listitem');
    article.tabIndex = 0;

    const titleHtml = note.title ? `<h3 class="note-title">${escapeHtml(note.title)}</h3>` : '';
    const contentHtml = note.content ? `<p class="note-content">${escapeHtml(note.content)}</p>` : '';
    const isChecked = selectedNoteIds.has(note.id);
    const pinTooltip = note.pinned ? 'Unpin note' : 'Pin note';

    article.innerHTML = `
      <div class="note-top-row">
        <button type="button" class="note-checkbox ${isChecked ? 'checked' : ''}" data-tooltip="Select note" aria-label="Select note">
          <svg viewBox="0 0 24 24" width="13" height="13"><path d="M4 12l5 5L20 6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button type="button" class="note-pin-btn ${note.pinned ? 'pinned' : ''}" data-tooltip="${pinTooltip}" aria-label="${pinTooltip}">
          ${iconPin()}
        </button>
      </div>
      ${titleHtml}
      ${contentHtml}
      <span class="note-date">${formatDate(note.createdAt)}</span>
      <div class="note-actions">
        <div class="toolbar-item-wrap">
          <button class="icon-btn card-color-btn" data-tooltip="Background options" aria-label="Choose color">${iconPalette()}</button>
        </div>
        <button class="icon-btn card-reminder-btn" data-tooltip="Remind me" aria-label="Remind me">${iconReminder()}</button>
        <button class="icon-btn card-collab-btn" data-tooltip="Collaborator" aria-label="Add collaborator">${iconCollaborator()}</button>
        <button class="icon-btn card-image-btn" data-tooltip="Add image" aria-label="Add image">${iconImage()}</button>
        <button class="icon-btn card-archive-btn" data-tooltip="${note.archived ? 'Unarchive' : 'Archive'}" aria-label="${note.archived ? 'Unarchive note' : 'Archive note'}">
          ${note.archived ? iconUnarchive() : iconArchive()}
        </button>
        <div class="toolbar-item-wrap">
          <button class="icon-btn card-menu-btn" data-tooltip="More" aria-label="More options">${iconKebab()}</button>
        </div>
      </div>
    `;

    // -- Wire up top-row controls --
    article.querySelector('.note-checkbox').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleNoteSelection(note.id, article);
    });
    article.querySelector('.note-pin-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      togglePin(note.id);
    });

    // -- Wire up bottom action bar --
    article.querySelector('.card-archive-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      archiveNote(note.id);
    });
    article.querySelector('.card-reminder-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      notImplemented('Reminders');
    });
    article.querySelector('.card-collab-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      notImplemented('Collaborators');
    });
    article.querySelector('.card-image-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      notImplemented('Adding images');
    });
    article.querySelector('.card-color-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openCardColorPopover(note.id, e.currentTarget);
    });
    article.querySelector('.card-menu-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openCardMenuPopover(note.id, e.currentTarget);
    });

    // Clicking the card body (not the actions) opens it for editing
    article.addEventListener('click', () => openModal(note.id));
    article.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') openModal(note.id);
    });

    return article;
  }

  // Toggles the visual "selected" checkbox state for a card
  function toggleNoteSelection(id, articleEl) {
    if (selectedNoteIds.has(id)) {
      selectedNoteIds.delete(id);
      articleEl.classList.remove('selected');
    } else {
      selectedNoteIds.add(id);
      articleEl.classList.add('selected');
    }
    articleEl.querySelector('.note-checkbox').classList.toggle('checked');
  }

  // Filters notes according to the current search query
  function filterBySearch(list) {
    if (!searchQuery) return list;
    return list.filter((n) =>
      n.title.toLowerCase().includes(searchQuery) ||
      n.content.toLowerCase().includes(searchQuery)
    );
  }

  // Builds a labelled group ("Pinned" / "Others") containing a notes grid
  function buildNotesGroup(labelText, list) {
    const wrapper = document.createElement('div');
    wrapper.className = 'notes-group';

    const label = document.createElement('h3');
    label.className = 'notes-group-label';
    label.textContent = labelText;

    const grid = document.createElement('div');
    grid.className = 'notes-grid';
    grid.setAttribute('role', 'list');
    list.forEach((note) => grid.appendChild(buildNoteCard(note)));

    wrapper.appendChild(label);
    wrapper.appendChild(grid);
    return wrapper;
  }

  // Re-renders both the active notes area and the archive grid from state
  function renderNotes() {
    const activeNotes = filterBySearch(notes.filter((n) => !n.archived));
    const archivedNotes = filterBySearch(notes.filter((n) => n.archived));

    // -- Active notes area (grouped into Pinned / Others when relevant) --
    notesContainer.innerHTML = '';
    const pinned = activeNotes.filter((n) => n.pinned);
    const others = activeNotes.filter((n) => !n.pinned);

    if (pinned.length > 0 && others.length > 0) {
      notesContainer.appendChild(buildNotesGroup('Pinned', pinned));
      notesContainer.appendChild(buildNotesGroup('Others', others));
    } else if (pinned.length > 0) {
      notesContainer.appendChild(buildNotesGroup('Pinned', pinned));
    } else {
      // No pins: plain grid, no group heading, matching default Keep view
      const grid = document.createElement('div');
      grid.className = 'notes-grid';
      grid.setAttribute('role', 'list');
      others.forEach((note) => grid.appendChild(buildNoteCard(note)));
      notesContainer.appendChild(grid);
    }

    const hasAnyActive = notes.some((n) => !n.archived);
    emptyNotes.classList.toggle('hidden', hasAnyActive || !!searchQuery);
    emptySearch.classList.toggle('hidden', !(searchQuery && activeNotes.length === 0 && hasAnyActive));
    notesContainer.classList.toggle('hidden', activeNotes.length === 0);

    // -- Archive grid --
    archiveGrid.innerHTML = '';
    archivedNotes.forEach((note) => archiveGrid.appendChild(buildNoteCard(note)));
    emptyArchive.classList.toggle('hidden', archivedNotes.length > 0);
    archiveGrid.classList.toggle('hidden', archivedNotes.length === 0);
  }


  /* ------------------------------------------------------------------
     8. ICONS (small inline SVG helpers, keeps markup readable above)
     ------------------------------------------------------------------ */

  function iconArchive() {
    return `<svg viewBox="0 0 24 24" width="18" height="18"><rect x="3" y="4" width="18" height="4" rx="1" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" fill="none" stroke="currentColor" stroke-width="1.8"/><line x1="10" y1="12" x2="14" y2="12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
  }
  function iconUnarchive() {
    return `<svg viewBox="0 0 24 24" width="18" height="18"><rect x="3" y="4" width="18" height="4" rx="1" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 13l3-3 3 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  // Rotated push-pin glyph, matching the reference screenshot's pin icon
  function iconPin() {
    return `<svg viewBox="0 0 24 24" width="15" height="15"><g transform="rotate(45 12 12)"><path d="M9 4h6v6.5l1.6 1.6v1.4H7.4v-1.4L9 10.5V4z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><line x1="12" y1="13.5" x2="12" y2="20" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></g></svg>`;
  }
  function iconPalette() {
    return `<svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.6 2-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.9 1.9-1.9H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><circle cx="7.5" cy="11" r="1.1" fill="currentColor"/><circle cx="10.5" cy="7.5" r="1.1" fill="currentColor"/><circle cx="15" cy="7.5" r="1.1" fill="currentColor"/><circle cx="17.5" cy="11" r="1.1" fill="currentColor"/></svg>`;
  }
  function iconReminder() {
    return `<svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 17v-5a6 6 0 0 1 12 0v5l1.5 2h-15z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M10 21a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
  }
  function iconCollaborator() {
    return `<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="9" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3 19c0-3 2.7-5 6-5s6 2 6 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="18" y1="8" x2="18" y2="14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="15" y1="11" x2="21" y2="11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
  }
  function iconImage() {
    return `<svg viewBox="0 0 24 24" width="18" height="18"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="8.5" cy="10" r="1.5" fill="currentColor"/><path d="M3 16l5-5 4 4 3-3 5 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
  }
  function iconKebab() {
    return `<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="5.5" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="18.5" r="1.6" fill="currentColor"/></svg>`;
  }


  /* ------------------------------------------------------------------
     9. MODAL (create / edit note)
     ------------------------------------------------------------------ */

  // Opens the modal. If noteId is provided, pre-fills it for editing.
  function openModal(noteId) {
    editingNoteId = noteId || '';
    formError.classList.add('hidden');
    colorPalette.classList.add('hidden');
    modalMenuPopover.classList.add('hidden');

    if (noteId) {
      const note = notes.find((n) => n.id === noteId);
      if (!note) return;
      noteTitleInput.value = note.title;
      noteContentInput.value = note.content;
      selectedColor = note.color;
      modalPinBtn.classList.toggle('pinned', !!note.pinned);
      modalArchiveBtn.innerHTML = note.archived ? iconUnarchive() : iconArchive();
      modalArchiveBtn.setAttribute('data-tooltip', note.archived ? 'Unarchive' : 'Archive');
    } else {
      noteTitleInput.value = '';
      noteContentInput.value = '';
      selectedColor = 'note-default';
      modalPinBtn.classList.remove('pinned');
      modalArchiveBtn.innerHTML = iconArchive();
      modalArchiveBtn.setAttribute('data-tooltip', 'Archive');
    }

    applyModalColor(selectedColor);
    modalOverlay.classList.remove('hidden');
    // Focus the most relevant field shortly after the modal paints in
    setTimeout(() => noteTitleInput.focus(), 50);
  }

  // Closes the modal, saving the note first if valid content was entered
  function closeModal() {
    const title = noteTitleInput.value;
    const content = noteContentInput.value;
    const pinned = modalPinBtn.classList.contains('pinned');

    if (validateForm(title, content)) {
      if (editingNoteId) {
        updateNote(editingNoteId, title, content, selectedColor, pinned);
      } else {
        createNote(title, content, selectedColor, pinned);
      }
    }
    resetModalState();
  }

  function resetModalState() {
    modalOverlay.classList.add('hidden');
    colorPalette.classList.add('hidden');
    modalMenuPopover.classList.add('hidden');
    noteForm.reset();
    editingNoteId = '';
    selectedColor = 'note-default';
    noteModal.style.background = 'var(--color-bg)';
  }

  // Handles explicit form submission (covers any programmatic submit)
  function handleFormSubmit(e) {
    e.preventDefault();
    const title = noteTitleInput.value;
    const content = noteContentInput.value;
    const pinned = modalPinBtn.classList.contains('pinned');

    if (!validateForm(title, content)) {
      formError.classList.remove('hidden');
      return;
    }
    formError.classList.add('hidden');

    if (editingNoteId) {
      updateNote(editingNoteId, title, content, selectedColor, pinned);
    } else {
      createNote(title, content, selectedColor, pinned);
    }
    resetModalState();
  }

  // Tints the entire modal card to preview the chosen background color,
  // the same way Google Keep's note editor does
  function applyModalColor(colorKey) {
    noteModal.style.background = `var(--${colorKey})`;
  }


  /* ------------------------------------------------------------------
     10. COLOR PALETTE POPOVER (shared markup, reused for modal + cards)
     ------------------------------------------------------------------ */

  // Fills a given palette container with clickable swatches
  function populateColorPalette(container, onPick) {
    container.innerHTML = '';
    NOTE_COLORS.forEach(([key, label]) => {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'color-swatch';
      swatch.style.background = `var(--${key})`;
      swatch.dataset.color = key;
      swatch.title = label;
      swatch.setAttribute('aria-label', label);
      swatch.addEventListener('click', (e) => {
        e.stopPropagation();
        onPick(key);
      });
      container.appendChild(swatch);
    });
  }

  function highlightSwatch(container, colorKey) {
    container.querySelectorAll('.color-swatch').forEach((el) => {
      el.classList.toggle('selected', el.dataset.color === colorKey);
    });
  }

  function buildModalColorPalette() {
    populateColorPalette(colorPalette, (key) => {
      selectedColor = key;
      applyModalColor(key);
      highlightSwatch(colorPalette, key);
    });
    highlightSwatch(colorPalette, selectedColor);
  }

  // Opens the shared floating color popover anchored to a card's palette button
  function openCardColorPopover(noteId, anchorEl) {
    activePopoverNoteId = noteId;
    const note = notes.find((n) => n.id === noteId);
    populateColorPalette(cardColorPopover, (key) => {
      const target = notes.find((n) => n.id === noteId);
      if (target) {
        target.color = key;
        saveNotesToStorage();
        renderNotes();
      }
      cardColorPopover.classList.add('hidden');
    });
    highlightSwatch(cardColorPopover, note ? note.color : 'note-default');
    positionPopover(cardColorPopover, anchorEl);
    cardMenuPopover.classList.add('hidden');
    cardColorPopover.classList.remove('hidden');
  }

  // Opens the shared floating kebab menu anchored to a card's menu button
  function openCardMenuPopover(noteId, anchorEl) {
    activePopoverNoteId = noteId;
    positionPopover(cardMenuPopover, anchorEl);
    cardColorPopover.classList.add('hidden');
    cardMenuPopover.classList.remove('hidden');
  }

  // Positions a fixed-position popover just above its trigger button
  function positionPopover(popoverEl, anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    popoverEl.style.left = `${Math.max(8, rect.left)}px`;
    popoverEl.style.top = `${rect.top - 8}px`;
    popoverEl.style.transform = 'translateY(-100%)';
  }

  function closeCardPopovers() {
    cardColorPopover.classList.add('hidden');
    cardMenuPopover.classList.add('hidden');
  }


  /* ------------------------------------------------------------------
     11. CONFIRM DELETE DIALOG
     ------------------------------------------------------------------ */

  function openConfirmDialog(noteId) {
    pendingDeleteId = noteId;
    confirmOverlay.classList.remove('hidden');
  }

  function closeConfirmDialog() {
    pendingDeleteId = '';
    confirmOverlay.classList.add('hidden');
  }


  /* ------------------------------------------------------------------
     12. SEARCH
     ------------------------------------------------------------------ */

  function handleSearchInput(e) {
    searchQuery = e.target.value.trim().toLowerCase();
    clearSearchBtn.classList.toggle('hidden', searchQuery.length === 0);
    renderNotes();
  }

  function clearSearch() {
    searchInput.value = '';
    searchQuery = '';
    clearSearchBtn.classList.add('hidden');
    renderNotes();
    searchInput.focus();
  }


  /* ------------------------------------------------------------------
     13. NAVIGATION (Notes / Archive sections)
     ------------------------------------------------------------------ */

  function switchSection(targetId) {
    sidebarItems.forEach((item) => {
      if (item.dataset.target) {
        item.classList.toggle('active', item.dataset.target === targetId);
      }
    });
    notesSection.classList.toggle('hidden', targetId !== 'notes-section');
    archiveSection.classList.toggle('hidden', targetId !== 'archive-section');
  }


  /* ------------------------------------------------------------------
     14. HEADER / MISC ACTIONS
     ------------------------------------------------------------------ */

  function handleRefresh() {
    renderNotes();
    showToast('Notes refreshed');
  }

  function toggleListView() {
    const isListView = document.body.classList.toggle('list-view');
    viewToggleBtn.setAttribute('data-tooltip', isListView ? 'Grid view' : 'List view');
  }


  /* ------------------------------------------------------------------
     15. EVENT WIRING
     ------------------------------------------------------------------ */

  function wireEvents() {
    // Open modal for a brand-new note
    quickAddBar.addEventListener('click', (e) => {
      // Ignore clicks on the decorative quick-icons; they have their own handler
      if (e.target.closest('.quick-icon')) return;
      openModal();
    });

    document.querySelectorAll('.quick-icon').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        notImplemented('This note type');
      });
    });

    // Modal close interactions
    closeModalBtn.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeModal();
    });
    noteForm.addEventListener('submit', handleFormSubmit);

    // Modal pin toggle
    modalPinBtn.addEventListener('click', () => {
      modalPinBtn.classList.toggle('pinned');
    });

    // Modal archive button archives immediately and closes the editor
    modalArchiveBtn.addEventListener('click', () => {
      if (editingNoteId) {
        archiveNote(editingNoteId);
        resetModalState();
      } else {
        notImplemented('Archiving a note that has not been saved yet');
      }
    });

    // Modal decorative toolbar buttons
    document.getElementById('checklistBtn').addEventListener('click', () => notImplemented('Checklists'));
    document.getElementById('reminderBtn').addEventListener('click', () => notImplemented('Reminders'));
    document.getElementById('collaboratorBtn').addEventListener('click', () => notImplemented('Collaborators'));
    document.getElementById('imageBtn').addEventListener('click', () => notImplemented('Adding images'));

    // Modal kebab menu
    modalMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      modalMenuPopover.classList.toggle('hidden');
    });
    modalDuplicateItem.addEventListener('click', () => {
      if (editingNoteId) {
        duplicateNote(editingNoteId);
        resetModalState();
      } else {
        notImplemented('Copying a note that has not been saved yet');
      }
      modalMenuPopover.classList.add('hidden');
    });
    modalDeleteItem.addEventListener('click', () => {
      modalMenuPopover.classList.add('hidden');
      if (editingNoteId) {
        const idToDelete = editingNoteId;
        resetModalState();
        openConfirmDialog(idToDelete);
      } else {
        resetModalState();
      }
    });

    // Escape key closes modal / popovers / confirm dialog
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!modalOverlay.classList.contains('hidden')) closeModal();
        if (!confirmOverlay.classList.contains('hidden')) closeConfirmDialog();
        closeCardPopovers();
      }
    });

    // Color palette toggle (modal)
    colorSwatchBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      colorPalette.classList.toggle('hidden');
    });

    // Global click: close any open popover when clicking outside of it
    document.addEventListener('click', (e) => {
      if (!colorPalette.classList.contains('hidden') && !colorPalette.contains(e.target) && e.target !== colorSwatchBtn) {
        colorPalette.classList.add('hidden');
      }
      if (!modalMenuPopover.classList.contains('hidden') && !modalMenuPopover.contains(e.target) && e.target !== modalMenuBtn) {
        modalMenuPopover.classList.add('hidden');
      }
      if (!cardColorPopover.classList.contains('hidden') && !cardColorPopover.contains(e.target) && !e.target.closest('.card-color-btn')) {
        cardColorPopover.classList.add('hidden');
      }
      if (!cardMenuPopover.classList.contains('hidden') && !cardMenuPopover.contains(e.target) && !e.target.closest('.card-menu-btn')) {
        cardMenuPopover.classList.add('hidden');
      }
    });

    // Shared card kebab menu actions
    cardDuplicateItem.addEventListener('click', () => {
      if (activePopoverNoteId) duplicateNote(activePopoverNoteId);
      closeCardPopovers();
    });
    cardDeleteItem.addEventListener('click', () => {
      const id = activePopoverNoteId;
      closeCardPopovers();
      if (id) openConfirmDialog(id);
    });

    // Confirm delete dialog
    cancelDeleteBtn.addEventListener('click', closeConfirmDialog);
    confirmOverlay.addEventListener('click', (e) => {
      if (e.target === confirmOverlay) closeConfirmDialog();
    });
    confirmDeleteBtn.addEventListener('click', () => {
      if (pendingDeleteId) deleteNote(pendingDeleteId);
      closeConfirmDialog();
    });

    // Search
    searchInput.addEventListener('input', handleSearchInput);
    clearSearchBtn.addEventListener('click', clearSearch);

    // Sidebar navigation (Notes / Archive) and decorative items (Reminders,
    // Edit labels, Trash) which are visually present but out of scope
    sidebarItems.forEach((item) => {
      item.addEventListener('click', () => {
        if (item.dataset.target) {
          switchSection(item.dataset.target);
        } else if (item.dataset.action) {
          notImplemented(item.querySelector('span').textContent);
        }
      });
    });

    // Header actions
    refreshBtn.addEventListener('click', handleRefresh);
    viewToggleBtn.addEventListener('click', toggleListView);
    settingsBtn.addEventListener('click', () => notImplemented('Settings'));
    appsBtn.addEventListener('click', () => notImplemented('The Google apps menu'));
    avatarBtn.addEventListener('click', () => notImplemented('Account management'));

    // Header shadow on scroll for a subtle depth cue
    window.addEventListener('scroll', () => {
      appHeader.classList.toggle('scrolled', window.scrollY > 4);
    });

    // Sidebar expands on hover (desktop) for readability
    sidebar.addEventListener('mouseenter', () => {
      if (window.innerWidth > 640) sidebar.style.width = 'var(--sidebar-width-expanded)';
    });
    sidebar.addEventListener('mouseleave', () => {
      sidebar.style.width = '';
    });

    // Reposition any open floating popover if the window is resized
    window.addEventListener('resize', closeCardPopovers);
  }


  /* ------------------------------------------------------------------
     16. INIT
     ------------------------------------------------------------------ */

  function init() {
    loadNotesFromStorage();
    buildModalColorPalette();
    wireEvents();
    renderNotes();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
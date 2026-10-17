// Shared app state. Plain object, mutated by app.js, read by views.js.
export const S = {
  settings: null,
  notes: [],
  filter: 'all',
  q: '',
  rec: null, // active Recorder
  setup: null, // choices on the record screen before starting
  detected: [],
  busy: {},
  rerun: {},
  checks: [],
  errors: [],
  chats: {},
  note: null, // note open in the note view
  noteTab: 'summary',
  find: '', // text being searched for inside the open note
  findIdx: 0,
  curSeg: null, // transcript line currently jumped to
  pendingFocus: false,
  largeText: false,
  sumLang: 'en',
  audioUrl: '',
  installEvt: null,
  showInstall: false
};

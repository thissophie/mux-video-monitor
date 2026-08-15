import { appendChild, elm } from './dom';
import { AdminStream, fetchStreams } from './admin/fetchStreams';
import { saveStream } from './admin/saveStream';
import { AccessDenied } from './helpers/AccessDenied';
import { isFailure, successValue } from './helpers/result';

const TAG_TITLE = 'multiview:title';
const TAG_ORDER = 'multiview:order';
const TAG_SHOW = 'multiview:show';
const TAG_DEMO = 'multiview:demo';

const tr = elm('tr');
const td = elm('td');
const th = elm('th');
const table = elm('table');
const input = elm('input');
const select = elm('select');
const option = elm('option');
const button = elm('button');
const span = elm('span');

const CELL = 'px-2 py-2 align-middle border-b border-gray-200';

const createRow = (stream: AdminStream, demos: string[]): HTMLTableRowElement => {
  const titleInput = input([], { type: 'text', class: 'border rounded px-2 py-1 w-64' });
  titleInput.value = stream.tags[TAG_TITLE] ?? '';

  const orderInput = input([], { type: 'number', class: 'border rounded px-2 py-1 w-20' });
  orderInput.value = stream.tags[TAG_ORDER] ?? '';

  const showInput = input([], { type: 'checkbox', class: 'w-4 h-4' });
  showInput.checked = stream.tags[TAG_SHOW] === 'true';

  const demoSelect = select(
    [option(['(none)'], { value: '' }), ...demos.map((demo) => option([demo], { value: demo }))],
    {
      class: 'border rounded px-2 py-1',
    },
  );
  demoSelect.value = stream.tags[TAG_DEMO] ?? '';

  const status = span([''], { class: 'text-sm text-gray-600' });

  const save = button(['Save'], { type: 'button', class: 'bg-blue-600 text-white rounded px-3 py-1' });

  save.addEventListener('click', () => {
    save.disabled = true;
    status.textContent = 'Saving…';

    void saveStream(stream.id, {
      title: titleInput.value,
      // Blank order means "no multiview:order tag", which is a valid state — send
      // nothing rather than '' so an untouched blank order cannot fail the save.
      order: orderInput.value === '' ? undefined : orderInput.value,
      show: showInput.checked,
      demo: demoSelect.value === '' ? null : demoSelect.value,
    }).then((result) => {
      save.disabled = false;

      if (isFailure(result)) {
        if (result.value instanceof AccessDenied) {
          window.location.href = '/access-denied.html';
          return;
        }
        status.textContent = `Failed: ${result.value.message}`;
        return;
      }

      const { tags, refreshed } = successValue(result);
      titleInput.value = tags[TAG_TITLE] ?? '';
      orderInput.value = tags[TAG_ORDER] ?? '';
      showInput.checked = tags[TAG_SHOW] === 'true';
      demoSelect.value = tags[TAG_DEMO] ?? '';
      status.textContent = refreshed
        ? `Saved ${new Date().toLocaleTimeString()}`
        : `Saved ${new Date().toLocaleTimeString()} — cache refresh failed, may take 60s`;
    });
  });

  return tr([
    td([stream.id], { class: `${CELL} font-mono text-sm` }),
    td([titleInput], { class: CELL }),
    td([orderInput], { class: CELL }),
    td([showInput], { class: `${CELL} text-center` }),
    td([demoSelect], { class: CELL }),
    td([save], { class: CELL }),
    td([status], { class: CELL }),
  ]);
};

const run = async () => {
  const root = document.getElementById('streams');
  const append = appendChild(root);

  const result = await fetchStreams();

  if (isFailure(result)) {
    if (result.value instanceof AccessDenied) {
      window.location.href = '/access-denied.html';
      return;
    }
    append(span([`Could not load streams: ${result.value.message}`], { class: 'text-red-700' }));
    return;
  }

  const { streams, demos } = successValue(result);

  append(
    table(
      [
        tr(
          ['Stream', 'Title', 'Order', 'Show', 'Demo', '', ''].map((label) =>
            th([label], { class: 'px-2 py-2 text-left text-sm font-semibold border-b-2 border-gray-300' }),
          ),
        ),
        ...streams.map((stream) => createRow(stream, demos)),
      ],
      { class: 'w-full border-collapse' },
    ),
  );
};

run().catch((err) => console.error('Failed somewhere', err));

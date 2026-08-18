import { anchor, appendChild, h2, listItem } from '../dom';
import { attendURI, fetchRooms } from '../fetchRooms';
import { AccessDenied } from '../helpers/AccessDenied';
import { isFailure, successValue } from '../helpers/result';

// <a href="#watch-1" class="block p-6 lg:p-8 rounded-2xl bg-lime">
//   <h2 class="text-2xl lg:text-3xl font-serif font-bold text-charcoal mb-1">Ballroom 1</h2>
// </a>

const createRoomLink = (id: string, label: string, active: boolean): HTMLAnchorElement =>
  anchor(
    attendURI(id, 'play-pyconau2026.html'),
    [label],
    [
      'relative',
      'z-10',
      'font-sans',
      'font-semibold',
      'text-sm',
      'lg:text-base',
      'px-4',
      'lg:px-5',
      'py-2.5',
      'whitespace-nowrap',
      'text-charcoal',
      'hover:bg-emerald',
      'rounded-full',
      active ? 'bg-lime' : undefined,
    ],
  );

// ' [',
// anchor(castURI(id), 'Cast'),
// ']',
const run = async () => {
  const accessDenied = document.querySelector('div#access-denied');
  const loading = document.querySelector('div#tabs-loading');
  const roomList = document.getElementById('room-list');

  const appendChildToRoomList = appendChild(roomList);

  const roomsResponse = await fetchRooms();

  if (isFailure(roomsResponse)) {
    if (roomsResponse.value instanceof AccessDenied) {
      accessDenied.classList.remove('hidden');
      loading.classList.add('hidden');
      return;
    }
    alert('Could not get rooms. Try again.');
    return;
  }

  const params = new URL(location.href).searchParams;
  const roomId = params.get('stream');

  const rooms = successValue(roomsResponse);

  for (const { id, name } of rooms) {
    appendChildToRoomList(createRoomLink(id, name, id === roomId));
  }

  loading.classList.add('hidden');
};

run().catch((err) => console.error('Failed somewhere', err));

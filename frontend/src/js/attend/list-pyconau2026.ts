import { anchor, appendChild, h2, listItem } from '../dom';
import { attendURI, fetchRooms } from '../fetchRooms';
import { AccessDenied } from '../helpers/AccessDenied';
import { isFailure, successValue } from '../helpers/result';

// <a href="#watch-1" class="block p-6 lg:p-8 rounded-2xl bg-lime">
//   <h2 class="text-2xl lg:text-3xl font-serif font-bold text-charcoal mb-1">Ballroom 1</h2>
// </a>

const createRoomLink = (id: string, label: string): HTMLAnchorElement =>
  anchor(
    attendURI(id, 'play-pyconau2026.html'),
    [h2(label, { class: 'text-2xl lg:text-3xl font-serif font-bold text-charcoal mb-1' })],
    ['block', 'p-6', 'lg:p-8', 'rounded-2xl', 'bg-lime'],
  );

// ' [',
// anchor(castURI(id), 'Cast'),
// ']',
const run = async () => {
  const loading = document.querySelector('div#loading');
  const roomList = document.getElementById('room-list');

  const appendChildToRoomList = appendChild(roomList);

  const roomsResponse = await fetchRooms();

  if (isFailure(roomsResponse)) {
    if (roomsResponse.value instanceof AccessDenied) {
      window.location.href = '/access-denied.html';
      return;
    }
    alert('Could not get rooms. Try again.');
    return;
  }

  const rooms = successValue(roomsResponse);

  for (const { id, name } of rooms) {
    appendChildToRoomList(createRoomLink(id, name));
  }

  loading.classList.add('hidden');
};

run().catch((err) => console.error('Failed somewhere', err));

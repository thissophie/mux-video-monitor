import { anchor, appendChild, h2, listItem } from '../dom';
import { attendURI, fetchRooms } from '../fetchRooms';
import { AccessDenied } from '../helpers/AccessDenied';
import { isFailure, successValue } from '../helpers/result';

const run = async () => {
  const accessDenied = document.querySelector('div#access-denied');
  const loading = document.querySelector('div#loading');
  const offline = document.querySelector('div#offline');
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

  const rooms = successValue(roomsResponse);

  const lastRoom = rooms[rooms.length - 1];

  if (lastRoom) {
    window.location.href = attendURI(lastRoom.id, 'play-pyconau2026.html');
    return;
  }

  loading.classList.add('hidden');
  offline.classList.remove('hidden');
};

run().catch((err) => console.error('Failed somewhere', err));

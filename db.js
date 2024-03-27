const { Level } = require('level')
const addresses = new Level('./db/addresses')
const rooms = new Level('./db/rooms')

async function getAllAddresses() {
  let list = []
  for await (const [key, value] of addresses.iterator()) {
    list.push({
      address: key,
      rooms: deserializeObject(value)
    })
  }
  return list
}

function serializeObject(obj) {
  return JSON.stringify(obj)
}

function deserializeObject(obj) {
  return JSON.parse(obj)
}

async function getAddresses(roomId) {
  try {
    return deserializeObject(await rooms.get(roomId))
  } catch { }
  return []
}

async function getRooms(address) {
  try {
    return deserializeObject(await addresses.get(address))
  } catch { }
  return []
}

async function addRoom(address, roomId) { //add room to address
  let list = await getRooms(address)
  if (list.indexOf(roomId) === -1) {
    list.push(roomId)
    await addresses.put(address, serializeObject(list))
  }
}

async function addAddress(roomId, address) { //add address to room
  let list = await getAddresses(roomId)
  if (list.indexOf(address) === -1) {
    list.push(address)
    await rooms.put(roomId, serializeObject(list))
    addRoom(address, roomId)
    return true
  }
  return false
}

async function removeAddress(roomId, address) {
  let list = await getAddresses(roomId)
  if (list.indexOf(address) === -1) return false
  list = list.filter(a => a !== address)
  await rooms.put(roomId, serializeObject(list))

  list = await getRooms(address)
  list = list.filter(a => a !== roomId)
  if (list.length === 0) addresses.del(address)
  else await addresses.put(address, serializeObject(list))
  return true
}

module.exports = {
  addAddress,
  removeAddress,
  getAddresses,
  getRooms,
  getAllAddresses
}
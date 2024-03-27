const dotenv = require('dotenv').config()
const { Telegraf } = require('telegraf')
const bot = new Telegraf(process.env.BOT_TOKEN)
const nearApi = require('near-api-js')

const { addAddress, removeAddress, getAllAddresses, getAddresses, getRooms } = require('./db')
const { txToString } = require('./util')

var watchlists = []
var options = {}
var messageQueue = []

const config = {
  networkId: 'mainnet',
  nodeUrl: 'https://rpc.mainnet.near.org',
  walletUrl: "https://wallet.mainnet.near.org",
  helperUrl: "https://helper.mainnet.near.org",
  explorerUrl: "https://nearblocks.io",
}

async function syncAddress() {
  watchlists = await getAllAddresses();
}

async function fetchTransactions() {
  if (options.busy) return
  options.busy = 1;
  try {
    //retrive transaction
    const keyStore = new nearApi.keyStores.InMemoryKeyStore();
    const near = await nearApi.connect({ deps: { keyStore }, ...config });
    const blocks = [];
    let checkedblock;
    for (let i = 0; i < 500; i++) {
      const param = checkedblock ? { blockId: checkedblock } : { finality: 'final' }
      const tempBlock = await near.connection.provider.block(param)
      if (!options.latestBlock) {
        options.latestBlock = tempBlock.header.prev_hash;
      } else if (options.latestBlock === tempBlock.header.hash) break;
      blocks.push(tempBlock);
      checkedblock = tempBlock.header.prev_hash; // fallback to prev block
    }
    console.log(`block: ${blocks.length}`)
    if (blocks[0]) options.latestBlock = blocks[0].header.hash

    const chunkHashs = blocks.flatMap(blocks => blocks.chunks.map(item => item.chunk_hash))
    const chunkDetails = await Promise.all(chunkHashs.map(chunk => near.connection.provider.chunk(chunk)));
    const txs = chunkDetails.flatMap(chunk => (chunk.transactions || [])).map(tx => ({
      sender: tx.signer_id,
      receiver: tx.receiver_id,
      hash: tx.hash,
      actions: tx.actions,
    }))
    console.log(`checked ${txs.length} txs, latest block: ${options.latestBlock}`)

    let tempQueue = []
    watchlists.forEach(item => {
      let list = txs.filter(tx => tx.sender === item.address || tx.receiver === item.address)
      if (list.length !== 0) {
        item.rooms.forEach(room => {
          list.forEach(tx => {
            tempQueue.push({
              id: room,
              tx: tx
            })
          })
        })
      }
    });
    console.log(`Queue ++${tempQueue.length}`)
    messageQueue.push.apply(messageQueue, tempQueue)
  } catch (err) {
    console.log(err)
  }
  options.busy = 0
}

async function handleQueue() {  // limit 30room/s and 30message/s => 429 Error
  const data = messageQueue.splice(0, 25);
  console.log(`take: ${data.length} - remain: ${messageQueue.length}`)
  data.forEach(async item => {
    bot.telegram.sendMessage(item.id, txToString(item.tx), { parse_mode: 'MarkdownV2' }).catch(async err => {
      console.log(`room: ${item.id}`)
      console.log(err.message)
    })
  })
}

setInterval(syncAddress, 60 * 1000)
setInterval(fetchTransactions, 10 * 1000)
setInterval(handleQueue, 1 * 5000)

bot.start(ctx => ctx.reply('Send an account name and the bot will notify you of new transactions'))

bot.command('add', async (ctx) => {
  const id = ctx.from.id
  const address = ctx.payload.split(' ')[0]
  await addAddress(id, address)
  return ctx.reply(`Added \`${address}\` to watchlist`, { parse_mode: 'MarkdownV2' })
})

bot.command('watchlist', async (ctx) => {
  const id = ctx.from.id
  const list = await getAddresses(id)
  return ctx.reply(`Watchlist:\n\`${list.join('\n')}\``, { parse_mode: 'MarkdownV2' })
})

bot.command('del', async (ctx) => {
  const id = ctx.from.id
  const address = ctx.payload.split(' ')[0]
  if (await removeAddress(id, address))
    return ctx.reply(`Removed \`${address}\` out of watchlist`, { parse_mode: 'MarkdownV2' })
  return ctx.reply(`Cant find \`${address}\` in watchlist`, { parse_mode: 'MarkdownV2' })
})

bot.catch(err => console.error(err))
bot.launch()
bot.telegram.getMe().then(res => console.log(res))
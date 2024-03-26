const { escapers } = require('@telegraf/entity')
const { utils } = require('near-api-js')

function extractActions(actions) {
  let tempActions = actions.map(action => {
    const key = Object.keys(action)[0]
    return { type: key, ...action[key] }
  })
  return tempActions.map(action => decodeAction(action))
}

function decodeAction(action) {
  if (action.gas) {
    action.gas = utils.format.formatNearAmount(String(action.gas), 16) + ' NEAR'
  }
  if (action.deposit) {
    action.deposit = utils.format.formatNearAmount(action.deposit, 16) + ' NEAR'
  }
  if (action.type === 'FunctionCall') {
    const temp = Buffer.from(action.args, 'base64')
    try {
      action.args = JSON.parse(String.fromCharCode(...temp))
    } catch {
      action.args = "Can't decode it"
    }
    return action
  } else if (action.type === 'Delegate') {
    const actions = extractActions(action.delegate_action.actions)
    action.delegate_action.actions = actions
    return action
  }
  return action

}

function txToString(tx) {
  const actions = extractActions(tx.actions)
  let s = `sender: *${escapers.MarkdownV2(tx.sender)}*
receiver: *${escapers.MarkdownV2(tx.receiver)}*
hash: *${escapers.MarkdownV2(tx.hash)}*
action: 
`;
  actions.forEach(action => {
    s += `\`${escapers.MarkdownV2(JSON.stringify(action, null, 2))}\`
`
  })
  return s
}

module.exports = {
  extractActions,
  txToString
};
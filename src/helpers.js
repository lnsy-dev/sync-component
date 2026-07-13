// Unambiguous alphabet: no 0/O, 1/I/L, so codes survive manual typing.
const PEER_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const PEER_CODE_LENGTH = 8;

/**
 * Generate a short alphanumeric peer code that can be typed by hand.
 * The code is registered as the PeerJS peer id, so it needs no decoding.
 * @param {number} length the length of the code
 * @return {string} the generated code
 */
export const generatePeerCode = (length = PEER_CODE_LENGTH) => {
  let code = '';
  if (globalThis.crypto?.getRandomValues) {
    const values = new Uint32Array(length);
    globalThis.crypto.getRandomValues(values);
    for (const value of values) {
      code += PEER_CODE_ALPHABET[value % PEER_CODE_ALPHABET.length];
    }
  } else {
    for (let i = 0; i < length; i++) {
      code += PEER_CODE_ALPHABET[Math.floor(Math.random() * PEER_CODE_ALPHABET.length)];
    }
  }
  return code;
};

export const getURLValues = (URL = window.location.href ) =>{
  const search_params = new URLSearchParams(new globalThis.URL(URL).search)
  let options = {}
  for (const [key, unparsed_value] of search_params) {
    try {
      const value = JSON.parse(decodeURI(unparsed_value))
      options[key] = value
    } catch {
      options[key] = decodeURI(unparsed_value)
    }
  }
  return options
}


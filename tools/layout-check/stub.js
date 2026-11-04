export const atom = (key, init) => ({ ...key, init })
export const read = async ($, a) => ($.values.has(a.key) ? $.values.get(a.key) : a.init)
export const update = async ($, a, fn) => { const v = fn($.values.has(a.key) ? $.values.get(a.key) : a.init); $.values.set(a.key, v); return v }

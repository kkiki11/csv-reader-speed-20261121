// Fast CSV reader for the csv-reader-speed-01 bounty.
//
// A fresh, single-pass implementation of the csv-reader 1.0.0 reading policy
// (see the kit's RULES.txt): run(input) returns exactly {columns, rows,
// errors} for {text, header}. Written from the policy description and verified
// against the reference, not copied from it.
//
// Speed comes from bulk slicing instead of per-character string building:
//  - unquoted fields are scanned with charCodeAt and taken with one slice;
//  - a quoted field's closing quote is found with indexOf (doubled quotes
//    skipped in the same search), and its content is sliced once — the common
//    case (no doubled quote, no line break inside) needs no further work;
//  - only the rare broken paths (stray CR, quote junk, unterminated quote,
//    line breaks inside quotes) fall back to a small character loop.
// No cross-case state, no network, no dependencies, deterministic output.

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  const n = text.length;
  let pos = text.charCodeAt(0) === 0xFEFF ? 1 : 0;
  let line = 1;
  let recordLine = 1;
  let recordRow = null;

  // Reads an unquoted field from pos, starting from the already-built prefix
  // `base`. Returns { value, ended, added }: ended 0 = comma, 1 = line break,
  // 2 = end of text; added counts the characters kept after `base`. Used for
  // quote junk, for the re-read of an unterminated quote, and for an unquoted
  // field that hits a stray CR — the rare paths only.
  function readUnquoted(base) {
    let value = base;
    let added = 0;
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 44) {
        pos += 1;
        return { value, ended: 0, added };
      }
      if (c === 10) {
        pos += 1;
        line += 1;
        return { value, ended: 1, added };
      }
      if (c === 13) {
        if (text.charCodeAt(pos + 1) === 10) {
          pos += 2;
          line += 1;
          return { value, ended: 1, added };
        }
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        pos += 1;
        continue;
      }
      value += text[pos];
      added += 1;
      pos += 1;
    }
    return { value, ended: 2, added };
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let ended = 0;
    let lastQuoted = false;

    do {
      if (text.charCodeAt(pos) === 34) {
        lastQuoted = true;
        const open = pos;
        // Find the closing quote: a quote not doubled by the next one.
        let q = text.indexOf('"', pos + 1);
        while (q !== -1 && text.charCodeAt(q + 1) === 34) q = text.indexOf('"', q + 2);
        if (q === -1) {
          // Never closes: the quote is a literal character, and the text
          // after it is read again as unquoted.
          errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
          pos = open + 1;
          const r = readUnquoted('"');
          fields.push(r.value);
          ended = r.ended;
        } else {
          const seg = text.slice(open + 1, q);
          let value;
          if (!/["\r\n]/.test(seg)) {
            value = seg;
          } else {
            let v = seg;
            if (v.indexOf('\r') !== -1) v = v.replace(/\r\n?/g, '\n');
            if (v.indexOf('"') !== -1) v = v.replaceAll('""', '"');
            let breaks = 0;
            for (let i = 0; i < v.length; i++) if (v.charCodeAt(i) === 10) breaks += 1;
            line += breaks;
            value = v;
          }
          pos = q + 1;
          if (pos >= n) {
            fields.push(value);
            ended = 2;
          } else {
            const c = text.charCodeAt(pos);
            if (c === 44) {
              pos += 1;
              fields.push(value);
              ended = 0;
            } else if (c === 10) {
              pos += 1;
              line += 1;
              fields.push(value);
              ended = 1;
            } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
              pos += 2;
              line += 1;
              fields.push(value);
              ended = 1;
            } else {
              // Junk after the closing quote, up to the next comma or break.
              const r = readUnquoted(value);
              if (r.added > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
              fields.push(r.value);
              ended = r.ended;
            }
          }
        }
      } else {
        lastQuoted = false;
        const start = pos;
        let value = '';
        let e = 2;
        let slow = false;
        while (pos < n) {
          const c = text.charCodeAt(pos);
          if (c === 44) {
            value = text.slice(start, pos);
            pos += 1;
            e = 0;
            break;
          }
          if (c === 10) {
            value = text.slice(start, pos);
            pos += 1;
            line += 1;
            e = 1;
            break;
          }
          if (c === 13) {
            if (text.charCodeAt(pos + 1) === 10) {
              value = text.slice(start, pos);
              pos += 2;
              line += 1;
              e = 1;
              break;
            }
            slow = true;
            break;
          }
          pos += 1;
        }
        if (slow) {
          const r = readUnquoted(text.slice(start, pos));
          fields.push(r.value);
          ended = r.ended;
        } else {
          if (pos >= n && e === 2) value = text.slice(start, pos);
          fields.push(value);
          ended = e;
        }
      }
    } while (ended === 0);

    // A line that held only stray CRs is left with no characters: no record.
    // A single empty unquoted field line is no record either; a single empty
    // quoted field is a record.
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      const extra = fields.slice(width);
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra });
      fields.length = width;
    }
    rows.push(fields);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}

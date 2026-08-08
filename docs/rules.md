# Rule reference

HanCaption QA separates structural errors, editorial warnings, and review information.

## Errors

| Code | Meaning |
| --- | --- |
| `INVALID_TIMESTAMP` | A cue has an unparseable or missing start/end timestamp. |
| `NEGATIVE_TIMESTAMP` | A cue begins or ends before zero. |
| `NO_CAPTIONS` | No caption cues could be parsed; the audit fails closed. |
| `UNPARSED_BLOCK` | A subtitle block could not be interpreted; the audit fails closed. |
| `UNSUPPORTED_ASS_FORMAT` | ASS uses a field order this release cannot parse safely. |
| `NON_POSITIVE_DURATION` | End time is equal to or earlier than start time. |
| `EMPTY_CAPTION` | Cue text is empty. |
| `CAPTION_OVERLAP` | A cue begins before the previous cue ends. |
| `REPLACEMENT_CHARACTER` | Text contains `U+FFFD`, often indicating an encoding failure. |
| `EMPTY_WORD` | A word-timing item has no text. |
| `INVALID_WORD_TIME` | A word has invalid, missing, or non-positive timing. |
| `OVERLAPPING_WORDS` | Word timings overlap or are out of order. |
| `WORD_OUTSIDE_CAPTION` | A word extends outside its parent cue. |
| `WORD_TEXT_MISMATCH` | Concatenated word text differs from the cue text, so word animation is blocked. |

## Warnings

| Code | Meaning |
| --- | --- |
| `TOO_BRIEF` | Cue duration is below the selected profile minimum. |
| `TOO_LONG` | Cue duration exceeds the selected profile maximum. |
| `TOO_MANY_LINES` | Cue contains more lines than the profile allows. |
| `LINE_TOO_LONG` | A line exceeds the profile's editorial character limit. |
| `READING_SPEED` | Visible text produces a high characters-per-second value. |
| `SPACE_BEFORE_CJK_PUNCTUATION` | A space appears before Chinese punctuation. |
| `ADJACENT_DUPLICATE` | A nearby cue repeats normalized text. |

## Information

| Code | Meaning |
| --- | --- |
| `POSSIBLE_CANTONESE_MARKERS` | A limited character heuristic found possible Cantonese markers. It is not language identification. Preserve source wording for human review. |
| `TEXT_REVIEW_REQUIRED` | Machine provenance or language-sensitive findings require human review. |

## Profiles

Profiles are editorial starting points, not formal accessibility or broadcast specifications.

| Setting | `general` | `short-video` |
| --- | ---: | ---: |
| Maximum characters/second | 17 | 15 |
| Maximum characters/line | 42 | 18 |
| Maximum lines | 2 | 2 |
| Minimum duration | 400 ms | 500 ms |
| Maximum duration | 8 s | 6 s |
| Duplicate gap window | 1.5 s | 1 s |

Threshold configuration is intentionally kept inside the programmatic API for v0.1. A documented config file is planned after real usage reveals which options remain stable.

## Word-animation policy

`wordAnimationAllowed=true` only when every caption has non-empty text, a non-empty word-timing list, matching normalized word/cue text, valid cue structure, and no error-level word-timing findings. Phrase-level SRT/VTT/ASS files therefore return `false`. This is a structural authorization only; it does not prove that the recognized text is semantically correct.

## JSON timing contract

Fields explicitly named `startMs`, `start_ms`, `endMs`, or `end_ms` use milliseconds. Generic `start`, `end`, `begin`, `finish`, `start_time`, and `end_time` fields use seconds in v0.1. Producers with a different contract should adapt fields explicitly before auditing; silent time-unit guessing would be less safe.

# AI screenshot recognition

Scope: browser image preparation, `/recognize` request/response validation, and the AWS recognition Lambda. The browser never receives the OpenAI key. Keep requests to at most four resized images, one model call, a 55 second client timeout, and a strict six-slot schema. Run `node tests/recognition.mjs`.

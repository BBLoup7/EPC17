\# Cursor Templates \& Notepad Snippets



\## API Fetch Hook

File: src/hooks/useFetch.js

```js

import { useState, useEffect } from 'react';

export function useFetch(url, opts) {

&nbsp; const \[data, setData] = useState(null);

&nbsp; const \[error, setError] = useState(null);

&nbsp; useEffect(() => {

&nbsp;   let mounted = true;

&nbsp;   fetch(url, opts)

&nbsp;     .then(r => r.json())

&nbsp;     .then(d => mounted \&\& setData(d))

&nbsp;     .catch(e => mounted \&\& setError(e));

&nbsp;   return () => { mounted = false; };

&nbsp; }, \[url]);

&nbsp; return { data, error };

}




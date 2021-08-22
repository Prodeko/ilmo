## \_pages folder

This folder contains pages that may be disabled through environment variables
and would break build if they were in pages/. For example, the register page is
only used if process.env.ENABLE_REGISTRATION=1.

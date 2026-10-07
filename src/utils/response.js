// Shared response envelope so every endpoint returns the same shape.
// Matches Module K's convention: { success, data } / { success, error: { code, message } }

const sendSuccess = (res, data, status = 200) => {
  return res.status(status).json({ success: true, data });
};

const sendError = (res, code, message, status = 400) => {
  return res.status(status).json({
    success: false,
    error: { code, message }
  });
};

module.exports = { sendSuccess, sendError };
const notificationService = require('../services/notification.service');

exports.getNotifications = async (req, res) => {
  try {
    const notifications = await notificationService.getNotifications();
    res.status(200).json({ success: true, data: notifications });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    await notificationService.markAsRead(req.params.id);
    res.status(200).json({ success: true, message: 'Marked as read' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.clearAll = async (req, res) => {
  try {
    await notificationService.clearAll();
    res.status(200).json({ success: true, message: 'All notifications cleared' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

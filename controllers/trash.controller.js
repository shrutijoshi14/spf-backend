const trashService = require('../services/trash.service');

exports.getTrash = async (req, res) => {
  try {
    const items = await trashService.getTrashItems();
    res.json({ success: true, data: items });
  } catch (err) {
    console.error('Get Trash Error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch trash items' });
  }
};

exports.restoreItem = async (req, res) => {
  try {
    const { type, id } = req.body;
    if (!type || !id) {
      return res.status(400).json({ success: false, message: 'Type and ID are required' });
    }

    await trashService.restoreItem(type, id);
    res.json({ success: true, message: 'Item restored successfully' });
  } catch (err) {
    console.error('Restore Error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

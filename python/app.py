from flask import Flask, request, jsonify
from dotenv import load_dotenv
import os
import re
from docx import Document

load_dotenv()
app = Flask(__name__)

UPLOAD_DIR = os.getenv('UPLOAD_DIR', '../uploads')

@app.route('/api/preprocess/word-metadata', methods=['POST'])
def clean_word_metadata():
    try:
        data = request.json
        file_path = data.get('file_path')
        
        if not file_path or not os.path.exists(file_path):
            return jsonify({'error': 'File not found'}), 400
        
        doc = Document(file_path)
        
        core_props = doc.core_properties
        core_props.author = ''
        core_props.title = ''
        core_props.subject = ''
        core_props.comments = ''
        core_props.keywords = ''
        core_props.last_modified_by = ''
        core_props.revision = 1
        
        doc.save(file_path)
        
        return jsonify({'status': 'success', 'message': 'Metadata cleaned'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/preprocess/markdown', methods=['POST'])
def normalize_markdown():
    try:
        data = request.json
        file_path = data.get('file_path')
        
        if not file_path or not os.path.exists(file_path):
            return jsonify({'error': 'File not found'}), 400
        
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        content = re.sub(r'\r\n', '\n', content)
        content = re.sub(r'[ \t]+$', '', content, flags=re.MULTILINE)
        content = re.sub(r'\n{3,}', '\n\n', content)
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        return jsonify({'status': 'success', 'message': 'Markdown normalized'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok'})

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)

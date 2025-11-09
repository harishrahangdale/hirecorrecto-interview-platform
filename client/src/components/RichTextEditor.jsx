import React, { useRef, useEffect, useState } from 'react'
import { Bold, Italic, Underline, List, ListOrdered, AlignLeft, Link, Undo, Redo } from 'lucide-react'

export default function RichTextEditor({ value, onChange, placeholder = 'Enter text...', className = '' }) {
  const editorRef = useRef(null)
  const [isFocused, setIsFocused] = useState(false)

  useEffect(() => {
    if (editorRef.current) {
      const currentContent = editorRef.current.innerHTML
      const newContent = value || ''
      // Only update if content actually changed to prevent cursor jumping
      if (currentContent !== newContent) {
        // Check if editor is focused - if so, don't update to preserve cursor
        if (document.activeElement !== editorRef.current) {
          editorRef.current.innerHTML = newContent
        }
      }
    }
  }, [value])

  const handleInput = () => {
    if (editorRef.current && onChange) {
      onChange(editorRef.current.innerHTML)
    }
  }

  const execCommand = (command, value = null) => {
    document.execCommand(command, false, value)
    editorRef.current?.focus()
    handleInput()
  }

  const handleKeyDown = (e) => {
    // Handle Ctrl+B, Ctrl+I, Ctrl+U shortcuts
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'b') {
        e.preventDefault()
        execCommand('bold')
      } else if (e.key === 'i') {
        e.preventDefault()
        execCommand('italic')
      } else if (e.key === 'u') {
        e.preventDefault()
        execCommand('underline')
      } else if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        execCommand('undo')
      } else if ((e.key === 'z' && e.shiftKey) || (e.key === 'y')) {
        e.preventDefault()
        execCommand('redo')
      }
    }
  }

  const isCommandActive = (command) => {
    return document.queryCommandState(command)
  }

  const handleLink = () => {
    const url = prompt('Enter URL:')
    if (url) {
      execCommand('createLink', url)
    }
  }

  const stripHtml = (html) => {
    const tmp = document.createElement('DIV')
    tmp.innerHTML = html
    return tmp.textContent || tmp.innerText || ''
  }

  return (
    <div className={`border-2 border-gray-200 rounded-xl focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all bg-white ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 p-2 border-b border-gray-200 bg-gray-50 rounded-t-xl flex-wrap">
        <div className="flex items-center gap-1 border-r border-gray-300 pr-2 mr-1">
          <button
            type="button"
            onClick={() => execCommand('bold')}
            className={`p-2 rounded hover:bg-gray-200 transition-colors ${
              isCommandActive('bold') ? 'bg-indigo-100 text-indigo-700' : 'text-gray-700'
            }`}
            title="Bold (Ctrl+B)"
          >
            <Bold className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => execCommand('italic')}
            className={`p-2 rounded hover:bg-gray-200 transition-colors ${
              isCommandActive('italic') ? 'bg-indigo-100 text-indigo-700' : 'text-gray-700'
            }`}
            title="Italic (Ctrl+I)"
          >
            <Italic className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => execCommand('underline')}
            className={`p-2 rounded hover:bg-gray-200 transition-colors ${
              isCommandActive('underline') ? 'bg-indigo-100 text-indigo-700' : 'text-gray-700'
            }`}
            title="Underline (Ctrl+U)"
          >
            <Underline className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-1 border-r border-gray-300 pr-2 mr-1">
          <button
            type="button"
            onClick={() => execCommand('insertUnorderedList')}
            className={`p-2 rounded hover:bg-gray-200 transition-colors ${
              isCommandActive('insertUnorderedList') ? 'bg-indigo-100 text-indigo-700' : 'text-gray-700'
            }`}
            title="Bullet List"
          >
            <List className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => execCommand('insertOrderedList')}
            className={`p-2 rounded hover:bg-gray-200 transition-colors ${
              isCommandActive('insertOrderedList') ? 'bg-indigo-100 text-indigo-700' : 'text-gray-700'
            }`}
            title="Numbered List"
          >
            <ListOrdered className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-1 border-r border-gray-300 pr-2 mr-1">
          <button
            type="button"
            onClick={() => execCommand('justifyLeft')}
            className="p-2 rounded hover:bg-gray-200 transition-colors text-gray-700"
            title="Align Left"
          >
            <AlignLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleLink}
            className="p-2 rounded hover:bg-gray-200 transition-colors text-gray-700"
            title="Insert Link"
          >
            <Link className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => execCommand('undo')}
            className="p-2 rounded hover:bg-gray-200 transition-colors text-gray-700"
            title="Undo (Ctrl+Z)"
          >
            <Undo className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => execCommand('redo')}
            className="p-2 rounded hover:bg-gray-200 transition-colors text-gray-700"
            title="Redo (Ctrl+Y)"
          >
            <Redo className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onKeyDown={handleKeyDown}
        className={`min-h-[120px] px-4 py-3 outline-none ${isFocused ? '' : ''}`}
        style={{
          wordBreak: 'break-word',
          overflowWrap: 'break-word'
        }}
        data-placeholder={placeholder}
        suppressContentEditableWarning={true}
      />
      
      {/* Placeholder styling */}
      <style>{`
        [contenteditable][data-placeholder]:empty:before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
        }
        [contenteditable] ul, [contenteditable] ol {
          margin-left: 1.5rem;
          margin-top: 0.5rem;
          margin-bottom: 0.5rem;
        }
        [contenteditable] ul {
          list-style-type: disc;
        }
        [contenteditable] ol {
          list-style-type: decimal;
        }
        [contenteditable] p {
          margin: 0.5rem 0;
        }
        [contenteditable] a {
          color: #4f46e5;
          text-decoration: underline;
        }
      `}</style>
    </div>
  )
}


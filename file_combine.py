import os
import sys
import subprocess
import fnmatch

DEFAULT_IGNORE_DIRS = {
    'node_modules', 
    'bower_components', 
    'vendor', 
    '.git', 
    '.svn', 
    '.idea', 
    '.vscode', 
    '__pycache__',
    'dist',
    'output',
    '.parcel-cache',
    'build',
    'coverage',
    'emails',
    'myaccount'
}

DEFAULT_IGNORE_FILES = {'star.min.js','crown.min.js','main.js','bootstrap.js','algolia.browser.umd.js',
                        'algoliasearch.helper.min.js','algoliasearch.helper.url.js','algoliasearch.helper.v3.min.js','algoliasearch.min.js','allsettled-polyfill.js',
                        'fuse.min.js','gopro.js','hammer.min.js','hogan.min.common.js','iframe-resizer.child.js','iframe-resizer.jquery.js',
                        'iframeSizer.min.js','intlTelInput.min.js','jquery.blockUI.min.js','jquery.easing.1.3.js','jquery.hammer.js',
                        '*.min.js','telutils.js','jquery.lazyloadxt.js','sw-toolbox.js','boostrap.js','index.js'}

def is_ignored_file(filename, ignore_files):
    return any(fnmatch.fnmatch(filename, pattern) for pattern in ignore_files)

def get_files_from_paths(paths, extensions=None, ignore_dirs=DEFAULT_IGNORE_DIRS, ignore_files=DEFAULT_IGNORE_FILES):
    all_files = []
    
    if extensions:
        extensions = [ext.lower() if ext.startswith('.') else f'.{ext.lower()}' for ext in extensions]
    
    for path in paths:
        path = os.path.normpath(path)
        if os.path.isfile(path):
            # Still respect ignore_files even for explicitly passed file paths
            if not is_ignored_file(os.path.basename(path), ignore_files):
                all_files.append(path)
            else:
                print(f"Skipping ignored file: {path}", file=sys.stderr)
        elif os.path.isdir(path):
            for root, dirs, files in os.walk(path):
                dirs[:] = [d for d in dirs if d not in ignore_dirs]
                
                for file in files:
                    if is_ignored_file(file, ignore_files):  # <-- skip ignored filenames
                        continue

                    file_path = os.path.normpath(os.path.join(root, file))
                    
                    if extensions:
                        file_ext = os.path.splitext(file)[1].lower()
                        if file_ext in extensions:
                            all_files.append(file_path)
                    else:
                        all_files.append(file_path)
        else:
            print(f"Warning: Path not found - {path}", file=sys.stderr)
    return all_files

def combine_files_to_clipboard(paths, extensions=None, ignore_files=DEFAULT_IGNORE_FILES):
    try:
        file_paths = get_files_from_paths(paths, extensions, DEFAULT_IGNORE_DIRS, ignore_files)
        
        if not file_paths:
            print("Error: No valid files found in the provided paths", file=sys.stderr)
            return False
            
        cwd = os.getcwd()
        combined_content = ""
        
        if extensions:
            combined_content += f"// Filtered by extensions: {', '.join(extensions)}\n"
        
        combined_content += f"// Excluded directories: {', '.join(sorted(DEFAULT_IGNORE_DIRS))}\n"

        if ignore_files:
            combined_content += f"// Excluded files: {', '.join(sorted(ignore_files))}\n"

        combined_content += "\n"
        
        for file_path in file_paths:
            rel_path = os.path.relpath(file_path, cwd)
            combined_content += f'// {rel_path}\n\n'
            
            try:
                with open(file_path, 'r', encoding='utf-8') as infile:
                    combined_content += infile.read()
                    combined_content += '\n\n'
            except FileNotFoundError:
                print(f"Warning: File not found - {rel_path}", file=sys.stderr)
            except UnicodeDecodeError:
                print(f"Warning: Could not read file (binary or encoding issue) - {rel_path}", file=sys.stderr)
        
        process = subprocess.Popen('pbcopy', env={'LANG': 'en_US.UTF-8'}, stdin=subprocess.PIPE)
        process.communicate(combined_content.encode('utf-8'))
        
        files_info = f"Successfully combined {len(file_paths)} files"
        if extensions:
            files_info += f" (filtered by: {', '.join(extensions)})"
        if ignore_files:
            files_info += f" (excluding files: {', '.join(sorted(ignore_files))})"
        files_info += " and copied to clipboard"
        print(files_info)
        return True
        
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        return False

if __name__ == '__main__':
    paths = [
        "backend/src",
        # "frontend/src"
    ]
    
    extensions = ['.ts', '.js','.tsx', '.jsx', '.css']

    ignore_files = set()
    
    if not paths:
        print("Error: No input paths specified in the hardcoded paths list")
        sys.exit(1)
    
    success = combine_files_to_clipboard(paths, extensions, DEFAULT_IGNORE_FILES | ignore_files)
    if success:
        print("Content is now in your clipboard. You can paste it anywhere with Cmd+V")
    else:
        sys.exit(1)
import subprocess
import sys
import argparse
import os
import tempfile

# Jupyter config: allow embedding in iframes (CSP frame-ancestors)
_JUPYTER_EMBED_HEADERS = '''
# Allow third-party sites to embed Amphi (JupyterLab) in iframes
c.ServerApp.tornado_settings = {
    "headers": {
        "Content-Security-Policy": "frame-ancestors 'self' *",
    }
}
'''

# Jupyter config: no token, no password - direct access (use only in trusted environments)
_JUPYTER_NO_AUTH_CONFIG = '''
# Allow access without token or password (no login)
c.ServerApp.token = ""
c.ServerApp.password = ""
'''


def main():
    parser = argparse.ArgumentParser(description='Amphi ETL Command Line Interface')
    parser.add_argument('command', choices=['start'], help='Command to start Amphi ETL')
    parser.add_argument('-w', '--workspace', default='.', help='Workspace directory for Amphi ETL')
    parser.add_argument('-p', '--port', type=int, default=8888, help='Port for Amphi ETL')
    parser.add_argument('-i', '--ip', default='localhost',
                        help='IP to bind (default: localhost). Use 0.0.0.0 to allow LAN access (e.g. http://YOUR_IP:PORT/)')
    parser.add_argument('--allow-lan', action='store_true',
                        help='Bind to 0.0.0.0 so other machines can access via your machine IP')
    parser.add_argument('--allow-embed', action='store_true',
                        help='Allow this instance to be embedded in iframes by third-party sites')
    parser.add_argument('--no-auth', action='store_true',
                        help='No login: disable token and password so users can access directly (use only in trusted environment)')
    parser.add_argument('--allow-root', action='store_true', help='Allow running Amphi ETL as root')

    args = parser.parse_args()
    if getattr(args, 'allow_lan', False):
        args.ip = '0.0.0.0'

    # Debugging logs
    print(f"Received command: {args.command}")
    print(f"Workspace directory: {args.workspace}")
    print(f"Port: {args.port}")
    print(f"IP: {args.ip}")
    print(f"Allow embed (iframe): {getattr(args, 'allow_embed', False)}")
    print(f"No auth (no login): {getattr(args, 'no_auth', False)}")
    print(f"Allow root: {args.allow_root}")
    print(f"Python executable: {sys.executable}")
    print(f"Environment PATH: {os.environ.get('PATH')}")

    if args.command == 'start':
        jupyter_command = [
            sys.executable, '-m', 'jupyter', 'lab',
            f'--notebook-dir={args.workspace}',
            f'--port={args.port}',
            f'--ip={args.ip}',
            '--ContentManager.allow_hidden=true'
        ]
        if args.allow_root:
            jupyter_command.append('--allow-root')

        env = os.environ.copy()
        allow_embed = getattr(args, 'allow_embed', False)
        no_auth = getattr(args, 'no_auth', False)
        if allow_embed or no_auth:
            config_dir = tempfile.mkdtemp(prefix='amphi_jupyter_config_')
            config_path = os.path.join(config_dir, 'jupyter_server_config.py')
            parts = []
            if allow_embed:
                parts.append(_JUPYTER_EMBED_HEADERS)
            if no_auth:
                parts.append(_JUPYTER_NO_AUTH_CONFIG)
            with open(config_path, 'w', encoding='utf-8') as f:
                f.write("\n".join(parts))
            env['JUPYTER_CONFIG_DIR'] = config_dir
            if allow_embed:
                print("Allow-embed: frame-ancestors 'self' *")
            if no_auth:
                print("No-auth: token and password disabled, direct access enabled")

        print(f"Running JupyterLab command: {' '.join(jupyter_command)}")
        try:
            subprocess.check_call(jupyter_command, env=env)
        except subprocess.CalledProcessError as e:
            print(f"Failed to start Amphi: {e}")

if __name__ == '__main__':
    main()

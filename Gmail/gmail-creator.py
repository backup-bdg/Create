import os
import subprocess
import traceback
import random
import string
import time
import tempfile
import uuid
import datetime
import psutil
import sys
import logging
import json
from typing import List, Optional
from concurrent.futures import ThreadPoolExecutor
from functools import partial
import requests
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
from selenium.common.exceptions import (
    TimeoutException,
    WebDriverException,
    NoSuchElementException
)
from fake_useragent import UserAgent
import asyncio
import aiohttp

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler('gmail_creation.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

async def fetch_free_proxies(limit=10):
    """Fetch free proxies from public APIs"""
    try:
        logger.info(f"Fetching up to {limit} free proxies from public APIs")
        proxies = []
        
        # List of free proxy APIs
        proxy_apis = [
            "https://www.proxy-list.download/api/v1/get?type=http",
            "https://api.proxyscrape.com/v2/?request=getproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all",
            "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt",
            "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt",
            "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt"
        ]
        
        async with aiohttp.ClientSession() as session:
            for api_url in proxy_apis:
                if len(proxies) >= limit:
                    break
                    
                try:
                    async with session.get(api_url, timeout=10) as response:
                        if response.status == 200:
                            content = await response.text()
                            # Parse the proxy list (format: IP:PORT)
                            for line in content.splitlines():
                                line = line.strip()
                                if line and ":" in line:
                                    proxies.append(line)
                                    if len(proxies) >= limit:
                                        break
                except Exception as e:
                    logger.warning(f"Error fetching proxies from {api_url}: {e}")
                    continue
        
        # Deduplicate and limit
        proxies = list(set(proxies))[:limit]
        logger.info(f"Successfully fetched {len(proxies)} proxies")
        return proxies
    except Exception as e:
        logger.error(f"Error in fetch_free_proxies: {e}")
        return []

class GmailAccountCreator:
    def __init__(self, config: dict):
        self.config = config
        self.user_agents = []
        self.proxies = []
        self.created_accounts = []
        self.temp_dirs = []
        self.max_retries = config.get('max_retries', 3)
        self.base_timeout = config.get('base_timeout', 30)
        self.max_concurrent = config.get('max_concurrent', 2)

    async def fetch_proxies(self) -> List[str]:
        """Fetch proxies asynchronously using custom proxy fetcher"""
        try:
            # Use our custom proxy fetcher instead of proxybroker
            proxies = await fetch_free_proxies(limit=self.config.get('proxy_limit', 10))
            logger.info(f"Fetched {len(proxies)} proxies")
            return proxies
        except Exception as e:
            logger.error(f"Error fetching proxies: {e}")
            return []

    def load_user_agents(self) -> List[str]:
        """Load user agents using fake_useragent"""
        try:
            ua = UserAgent()
            self.user_agents = [ua.random for _ in range(self.config.get('ua_count', 100))]
            logger.info(f"Loaded {len(self.user_agents)} user agents")
            return self.user_agents
        except Exception as e:
            logger.error(f"Error loading user agents: {e}")
            return [
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
            ]

    def generate_random_credentials(self) -> dict:
        """Generate random credentials for account creation"""
        def random_string(length: int) -> str:
            letters = string.ascii_lowercase + string.digits
            return ''.join(random.choice(letters) for _ in range(length))

        return {
            'first_name': random_string(8),
            'last_name': random_string(10),
            'username': random_string(10) + str(random.randint(1000, 9999)),
            'password': random_string(12) + str(random.randint(100, 999)) + '@'
        }

    def kill_chrome_processes(self):
        """Kill any existing Chrome processes"""
        for proc in psutil.process_iter(['pid', 'name']):
            try:
                if 'chrome' in proc.info['name'].lower() or 'chromedriver' in proc.info['name'].lower():
                    logger.info(f"Terminating process: {proc.info['name']} (PID: {proc.info['pid']})")
                    proc.terminate()
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                pass

    def setup_driver(self, user_agent: str, proxy: Optional[str] = None) -> webdriver.Chrome:
        """Setup Chrome WebDriver with configured options"""
        options = Options()
        options.add_argument(f"user-agent={user_agent}")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--headless=new")
        options.add_argument("--disable-extensions")
        options.add_argument("--disable-gpu")
        options.add_argument("--no-first-run")
        options.add_argument("--no-default-browser-check")
        options.add_experimental_option("excludeSwitches", ["enable-automation"])
        options.add_experimental_option("useAutomationExtension", False)

        # Setup unique user data directory
        timestamp = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
        unique_id = str(uuid.uuid4())
        user_data_dir = os.path.join(tempfile.gettempdir(), f"chrome_data_{timestamp}_{unique_id}")
        self.temp_dirs.append(user_data_dir)
        options.add_argument(f"--user-data-dir={user_data_dir}")

        if proxy:
            options.add_argument(f"--proxy-server={proxy}")

        try:
            service = Service(timeout=60)
            driver = webdriver.Chrome(service=service, options=options)
            return driver
        except WebDriverException as e:
            logger.error(f"Failed to initialize WebDriver: {e}")
            raise

    def cleanup(self):
        """Clean up temporary directories and Chrome processes"""
        self.kill_chrome_processes()
        for temp_dir in self.temp_dirs:
            try:
                if os.path.exists(temp_dir):
                    import shutil
                    shutil.rmtree(temp_dir, ignore_errors=True)
                    logger.info(f"Cleaned up: {temp_dir}")
            except Exception as e:
                logger.error(f"Error cleaning up {temp_dir}: {e}")
        self.temp_dirs.clear()

    def save_account(self, credentials: dict):
        """Save created account details"""
        try:
            with open(self.config.get('output_file', 'created_accounts.json'), 'a') as f:
                json.dump(credentials, f)
                f.write('\n')
            self.created_accounts.append(credentials)
            logger.info(f"Saved account: {credentials['username']}")
        except Exception as e:
            logger.error(f"Error saving account: {e}")

    async def create_account(self, user_agent: str, proxy: Optional[str] = None, retry_count: int = 0) -> bool:
        """Create a single Gmail account"""
        driver = None
        try:
            driver = self.setup_driver(user_agent, proxy)
            wait = WebDriverWait(driver, self.base_timeout)
            
            logger.info(f"Starting account creation with UA: {user_agent[:50]}... Proxy: {proxy or 'None'}")
            
            driver.get("https://accounts.google.com/signup")

            # Wait for and click Create Account button
            create_button = wait.until(EC.element_to_be_clickable((By.XPATH, "//span[contains(text(), 'Create account')]")))
            create_button.click()

            # Select "For myself" option
            for_myself = wait.until(EC.element_to_be_clickable((By.XPATH, "//div[contains(text(), 'For myself')]")))
            for_myself.click()

            credentials = self.generate_random_credentials()

            # Fill form
            selectors = {
                'firstName': (By.ID, 'firstName'),
                'lastName': (By.ID, 'lastName'),
                'username': (By.ID, 'username'),
                'password': (By.NAME, 'Passwd'),
                'confirm_password': (By.NAME, 'ConfirmPasswd')
            }

            for field, selector in selectors.items():
                element = wait.until(EC.element_to_be_clickable(selector))
                element.send_keys(credentials[field.replace('confirm_password', 'password')])

            # Submit form
            next_button = wait.until(EC.element_to_be_clickable((By.XPATH, "//span[contains(text(), 'Next')]")))
            next_button.click()

            # Wait for phone verification page
            wait.until(EC.presence_of_element_located((By.ID, "phoneNumberId")))
            
            self.save_account(credentials)
            return True

        except (TimeoutException, NoSuchElementException) as e:
            if retry_count < self.max_retries:
                logger.warning(f"Retry {retry_count + 1}/{self.max_retries} after error: {e}")
                await asyncio.sleep(random.uniform(2, 5))
                return await self.create_account(user_agent, proxy, retry_count + 1)
            logger.error(f"Failed after {self.max_retries} retries: {e}")
            driver.save_screenshot(f"error_{uuid.uuid4()}.png")
            return False

        except Exception as e:
            logger.error(f"Unexpected error: {e}")
            traceback.print_exc()
            driver.save_screenshot(f"error_{uuid.uuid4()}.png")
            return False

        finally:
            if driver:
                try:
                    driver.quit()
                except:
                    pass

    async def run(self):
        """Main execution method"""
        try:
            # Load user agents and proxies
            self.user_agents = self.load_user_agents()
            self.proxies = await self.fetch_proxies()

            # Prepare tasks
            tasks = []
            for i in range(self.config.get('account_count', 5)):
                user_agent = random.choice(self.user_agents)
                proxy = random.choice(self.proxies) if self.proxies else None
                tasks.append(self.create_account(user_agent, proxy))

            # Run tasks concurrently with rate limiting
            with ThreadPoolExecutor(max_workers=self.max_concurrent) as executor:
                await asyncio.gather(*[asyncio.to_thread(lambda t=task: asyncio.run(t)) for t in tasks])

            logger.info(f"Created {len(self.created_accounts)} accounts successfully")

        except Exception as e:
            logger.error(f"Main execution error: {e}")
            sys.exit(1)

        finally:
            self.cleanup()

def main():
    config = {
        'account_count': 5,
        'max_retries': 3,
        'base_timeout': 30,
        'proxy_limit': 10,
        'ua_count': 100,
        'max_concurrent': 2,
        'output_file': 'created_accounts.json'
    }

    creator = GmailAccountCreator(config)
    asyncio.run(creator.run())

if __name__ == "__main__":
    main()

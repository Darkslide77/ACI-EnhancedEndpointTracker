
from ... rest import Rest
from ... rest import api_register
from . import ManagedObject

import logging

# module level logging
logger = logging.getLogger(__name__)

@api_register(parent="fabric", path="mo/vnsLIfCtx")
class vnsLIfCtx(ManagedObject):

    META = ManagedObject.append_meta({})

